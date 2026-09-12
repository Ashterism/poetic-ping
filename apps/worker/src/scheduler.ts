import { db, rpc } from "./db";
import { sendEmail } from "./email";
import { Birthday, Delivery, Poem, PoemTag, Profile, WeeklyPreference } from "./types";

type LocalParts = { year: number; month: number; day: number; weekday: number; minutes: number; dateKey: string };

function localParts(at: Date, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(at).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const year = Number(parts.year), month = Number(parts.month), day = Number(parts.day);
  return { year, month, day, weekday: weekdays[parts.weekday ?? ""] ?? -1, minutes: Number(parts.hour) * 60 + Number(parts.minute), dateKey: `${parts.year}-${parts.month}-${parts.day}` };
}

function timeMinutes(value: string): number {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

function inDeliveryWindow(nowMinutes: number, configured: string): boolean {
  const start = timeMinutes(configured);
  return nowMinutes >= start && nowMinutes < start + 30;
}

function isLeap(year: number): boolean { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }

function birthdayMatches(local: LocalParts, birthDate: string, daysBefore: number): boolean {
  const upcoming = new Date(Date.UTC(local.year, local.month - 1, local.day + daysBefore));
  const [, birthMonthText, birthDayText] = birthDate.split("-");
  const birthMonth = Number(birthMonthText), birthDay = Number(birthDayText);
  const adjustedDay = birthMonth === 2 && birthDay === 29 && !isLeap(upcoming.getUTCFullYear()) ? 28 : birthDay;
  return upcoming.getUTCMonth() + 1 === birthMonth && upcoming.getUTCDate() === adjustedDay;
}

function workingDaysBeforeMatches(local: LocalParts, birthDate: string, daysBefore: number): boolean {
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day));
  let remaining = daysBefore;
  while (remaining > 0) {
    target.setUTCDate(target.getUTCDate() + 1);
    const weekday = target.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  const [, monthText, dayText] = birthDate.split("-");
  const month = Number(monthText), day = Number(dayText);
  const adjustedDay = month === 2 && day === 29 && !isLeap(target.getUTCFullYear()) ? 28 : day;
  return target.getUTCMonth() + 1 === month && target.getUTCDate() === adjustedDay;
}

async function digestIndex(seed: string, length: number): Promise<number> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  const number = ((digest[0] ?? 0) << 24) | ((digest[1] ?? 0) << 16) | ((digest[2] ?? 0) << 8) | (digest[3] ?? 0);
  return (number >>> 0) % length;
}

async function selectPoem(env: Env, userId: string, tagIds: string[], seed: string): Promise<Poem | null> {
  const [poems, recent, declined] = await Promise.all([
    db<Poem[]>(env, "poems", { query: { select: "id,user_id,title,author,body,language,active", active: "eq.true", or: `(user_id.eq.${userId},user_id.is.null)` } }),
    db<Delivery[]>(env, "delivery_history", { query: { select: "id,poem_id,sent_at,status", user_id: `eq.${userId}`, status: "eq.sent", poem_id: "not.is.null", order: "sent_at.desc", limit: "5" } }),
    db<Delivery[]>(env, "delivery_history", { query: { select: "poem_id", user_id: `eq.${userId}`, feedback_action: "eq.not_for_me", poem_id: "not.is.null" } }),
  ]);
  const excluded = new Set([...recent, ...declined].map((item) => item.poem_id).filter((id): id is string => Boolean(id)));
  let candidates = poems.filter((poem) => !excluded.has(poem.id));
  if (tagIds.length && candidates.length) {
    const joins = await db<PoemTag[]>(env, "poem_tags", { query: { select: "poem_id,tag_id", tag_id: `in.(${tagIds.join(",")})`, poem_id: `in.(${candidates.map((poem) => poem.id).join(",")})` } });
    const tagged = new Set(joins.map((join) => join.poem_id));
    candidates = candidates.filter((poem) => tagged.has(poem.id));
  }
  if (!candidates.length) {
    candidates = poems.filter((poem) => !excluded.has(poem.id));
    if (!candidates.length) candidates = poems;
  }
  return candidates.length ? candidates[await digestIndex(seed, candidates.length)] ?? null : null;
}

async function claim(env: Env, values: { userId: string; birthdayId: string | null; poemId: string | null; type: "birthday" | "weekly_poem"; email: string; scheduledFor: string; key: string }): Promise<string | null> {
  return rpc<string | null>(env, "claim_delivery", {
    p_user_id: values.userId, p_birthday_id: values.birthdayId, p_poem_id: values.poemId,
    p_delivery_type: values.type, p_recipient_email: values.email,
    p_scheduled_for: values.scheduledFor, p_idempotency_key: values.key,
  });
}

async function finish(env: Env, id: string, status: "sent" | "failed", providerId?: string, error?: string): Promise<void> {
  await db(env, "delivery_history", { method: "PATCH", query: { id: `eq.${id}` }, body: { status, sent_at: status === "sent" ? new Date().toISOString() : null, provider_id: providerId ?? null, error_message: error?.slice(0, 1000) ?? null } });
}

async function deliver(env: Env, profile: Profile, values: { birthday?: Birthday; type: "birthday" | "weekly_poem"; key: string; tagIds: string[]; at: Date }): Promise<boolean> {
  const poem = await selectPoem(env, profile.id, values.tagIds, values.key);
  if (values.type === "weekly_poem" && !poem) return false;
  const deliveryId = await claim(env, { userId: profile.id, birthdayId: values.birthday?.id ?? null, poemId: poem?.id ?? null, type: values.type, email: profile.email, scheduledFor: values.at.toISOString(), key: values.key });
  if (!deliveryId) return false;
  const rows = await db<Array<{ feedback_token: string }>>(env, "delivery_history", { query: { select: "feedback_token", id: `eq.${deliveryId}`, limit: "1" } });
  const feedbackToken = rows[0]?.feedback_token;
  if (!feedbackToken) return false;
  try {
    const providerId = await sendEmail(env, profile, poem, feedbackToken, values.birthday);
    await finish(env, deliveryId, "sent", providerId);
    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Unknown delivery error";
    await finish(env, deliveryId, "failed", undefined, message);
    console.error(JSON.stringify({ message: "Delivery failed", deliveryId, type: values.type, reason: message }));
    return false;
  }
}

export async function runSchedule(env: Env, at: Date): Promise<{ checked: number; sent: number }> {
  const profiles = await db<Profile[]>(env, "profiles", { query: { select: "id,email,display_name,timezone,birthday_delivery_time,birthday_reminders_enabled" } });
  let sent = 0;
  for (const profile of profiles) {
    try {
      const local = localParts(at, profile.timezone);
      const [birthdays, preferences, preferenceTags] = await Promise.all([
        db<Birthday[]>(env, "birthdays", { query: { select: "id,user_id,person_name,birth_date,relationship,notes,reminder_days_before,reminder_working_days_before,active", user_id: `eq.${profile.id}`, active: "eq.true" } }),
        db<WeeklyPreference[]>(env, "weekly_preferences", { query: { select: "user_id,enabled,weekday,local_time", user_id: `eq.${profile.id}`, limit: "1" } }),
        db<{ tag_id: string }[]>(env, "weekly_preference_tags", { query: { select: "tag_id", user_id: `eq.${profile.id}` } }),
      ]);
      const tagIds = preferenceTags.map((item) => item.tag_id);
      if (profile.birthday_reminders_enabled && inDeliveryWindow(local.minutes, profile.birthday_delivery_time)) {
        for (const birthday of birthdays) {
          for (const days of birthday.reminder_days_before) {
            if (!birthdayMatches(local, birthday.birth_date, days)) continue;
            const key = `birthday:${birthday.id}:${local.dateKey}:${days}`;
            if (await deliver(env, profile, { birthday, type: "birthday", key, tagIds, at })) sent += 1;
          }
          for (const days of birthday.reminder_working_days_before ?? []) {
            if (!workingDaysBeforeMatches(local, birthday.birth_date, days)) continue;
            const key = `birthday:${birthday.id}:${local.dateKey}:working-${days}`;
            if (await deliver(env, profile, { birthday, type: "birthday", key, tagIds, at })) sent += 1;
          }
        }
      }
      const preference = preferences[0];
      if (preference?.enabled && preference.weekday === local.weekday && inDeliveryWindow(local.minutes, preference.local_time)) {
        const key = `weekly:${profile.id}:${local.dateKey}`;
        if (await deliver(env, profile, { type: "weekly_poem", key, tagIds, at })) sent += 1;
      }
    } catch (cause) {
      console.error(JSON.stringify({ message: "User schedule failed", userId: profile.id, reason: cause instanceof Error ? cause.message : "unknown" }));
    }
  }
  return { checked: profiles.length, sent };
}
