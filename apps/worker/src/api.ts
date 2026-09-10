import { db } from "./db";
import { Birthday, HttpError, Identity, Poem, PoemTag, Profile, Tag, WeeklyPreference } from "./types";
import { assertTimezone, booleanField, integerField, objectBody, slug, stringField, validDate, validTime } from "./validation";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function body(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 64_000) throw new HttpError(413, "Request body is too large.");
  return objectBody(await request.json().catch(() => { throw new HttpError(400, "Invalid JSON."); }));
}

async function bootstrapProfile(env: Env, identity: Identity): Promise<Profile> {
  let rows = await db<Profile[]>(env, "profiles", { query: { select: "id,email,display_name,timezone,birthday_delivery_time", id: `eq.${identity.id}`, limit: "1" } });
  if (!rows[0]) {
    rows = await db<Profile[]>(env, "profiles", { method: "POST", prefer: "return=representation", body: { id: identity.id, email: identity.email, display_name: identity.name } });
  } else if (rows[0].email !== identity.email) {
    rows = await db<Profile[]>(env, "profiles", { method: "PATCH", query: { id: `eq.${identity.id}` }, prefer: "return=representation", body: { email: identity.email } });
  }
  await db(env, "weekly_preferences", { method: "POST", query: { on_conflict: "user_id" }, prefer: "resolution=ignore-duplicates", body: { user_id: identity.id } });
  const profile = rows[0];
  if (!profile) throw new HttpError(502, "Profile could not be loaded.");
  return profile;
}

function reminderDays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 10 || value.some((day) => !Number.isInteger(day) || day < 0 || day > 365)) throw new HttpError(400, "reminder_days_before must contain 1–10 whole days between 0 and 365.");
  return [...new Set(value as number[])];
}

function workingReminderDays(value: unknown): number[] {
  if (!Array.isArray(value) || value.length > 10 || value.some((day) => !Number.isInteger(day) || day < 1 || day > 365)) throw new HttpError(400, "reminder_working_days_before must contain whole days between 1 and 365.");
  return [...new Set(value as number[])];
}

async function listPoems(env: Env, userId: string): Promise<Array<Poem & { tags: Pick<Tag, "id" | "name">[] }>> {
  const poems = await db<Poem[]>(env, "poems", { query: { select: "id,user_id,title,author,body,language,active,access_type,source_type,source_title,source_section,source_page,source_url,rights_note", or: `(user_id.eq.${userId},user_id.is.null)`, active: "eq.true", order: "created_at.desc" } });
  if (!poems.length) return [];
  const joins = await db<PoemTag[]>(env, "poem_tags", { query: { select: "poem_id,tag_id", poem_id: `in.(${poems.map((poem) => poem.id).join(",")})` } });
  const tagIds = [...new Set(joins.map((join) => join.tag_id))];
  const tags = tagIds.length ? await db<Tag[]>(env, "tags", { query: { select: "id,user_id,name,slug", id: `in.(${tagIds.join(",")})` } }) : [];
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return poems.map((poem) => ({ ...poem, tags: joins.filter((join) => join.poem_id === poem.id).map((join) => byId.get(join.tag_id)).filter((tag): tag is Tag => Boolean(tag)).map(({ id, name }) => ({ id, name })) }));
}

async function attachTags(env: Env, userId: string, poemId: string, values: unknown): Promise<void> {
  if (values === undefined) return;
  if (!Array.isArray(values) || values.length > 20 || values.some((value) => typeof value !== "string")) throw new HttpError(400, "tags must be an array of names.");
  for (const raw of values as string[]) {
    const name = raw.trim().slice(0, 80);
    if (!name) continue;
    const tagSlug = slug(name);
    let tags = await db<Tag[]>(env, "tags", { query: { select: "id,user_id,name,slug", user_id: `eq.${userId}`, slug: `eq.${tagSlug}`, limit: "1" } });
    if (!tags[0]) tags = await db<Tag[]>(env, "tags", { method: "POST", prefer: "return=representation", body: { user_id: userId, name, slug: tagSlug } });
    const tag = tags[0];
    if (tag) await db(env, "poem_tags", { method: "POST", query: { on_conflict: "poem_id,tag_id" }, prefer: "resolution=ignore-duplicates", body: { poem_id: poemId, tag_id: tag.id } });
  }
}

export async function handleApi(request: Request, env: Env, identity: Identity): Promise<unknown> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const resource = parts[1];
  const id = parts[2];
  const profile = await bootstrapProfile(env, identity);

  if (resource === "me" && !id) {
    if (request.method === "GET") return profile;
    if (request.method === "PUT") {
      const input = await body(request);
      const timezone = stringField(input, "timezone", 120)!;
      const deliveryTime = stringField(input, "birthday_delivery_time", 8)!;
      assertTimezone(timezone);
      if (!validTime(deliveryTime)) throw new HttpError(400, "birthday_delivery_time is invalid.");
      const displayName = stringField(input, "display_name", 120, false);
      const rows = await db<Profile[]>(env, "profiles", { method: "PATCH", query: { id: `eq.${identity.id}` }, prefer: "return=representation", body: { display_name: displayName, timezone, birthday_delivery_time: deliveryTime } });
      return rows[0];
    }
  }

  if (resource === "birthdays") {
    if (!id && request.method === "GET") return db<Birthday[]>(env, "birthdays", { query: { select: "id,user_id,person_name,birth_date,relationship,notes,reminder_days_before,reminder_working_days_before,active", user_id: `eq.${identity.id}`, order: "birth_date.asc" } });
    if (!id && request.method === "POST") {
      const input = await body(request);
      const birthDate = stringField(input, "birth_date", 10)!;
      if (!validDate(birthDate)) throw new HttpError(400, "birth_date must be a real YYYY-MM-DD date.");
      const rows = await db<Birthday[]>(env, "birthdays", { method: "POST", prefer: "return=representation", body: { user_id: identity.id, person_name: stringField(input, "person_name", 120), birth_date: birthDate, relationship: stringField(input, "relationship", 80, false), notes: stringField(input, "notes", 2000, false), reminder_days_before: reminderDays(input.reminder_days_before ?? [0]), reminder_working_days_before: workingReminderDays(input.reminder_working_days_before ?? []) } });
      return rows[0];
    }
    if (id && uuid.test(id) && request.method === "DELETE") {
      await db(env, "birthdays", { method: "DELETE", query: { id: `eq.${id}`, user_id: `eq.${identity.id}` } });
      return { ok: true };
    }
    if (id && uuid.test(id) && request.method === "PUT") {
      const input = await body(request);
      const birthDate = stringField(input, "birth_date", 10)!;
      if (!validDate(birthDate)) throw new HttpError(400, "birth_date must be a real YYYY-MM-DD date.");
      const rows = await db<Birthday[]>(env, "birthdays", { method: "PATCH", query: { id: `eq.${id}`, user_id: `eq.${identity.id}` }, prefer: "return=representation", body: { person_name: stringField(input, "person_name", 120), birth_date: birthDate, relationship: stringField(input, "relationship", 80, false), notes: stringField(input, "notes", 2000, false), reminder_days_before: reminderDays(input.reminder_days_before), reminder_working_days_before: workingReminderDays(input.reminder_working_days_before ?? []), active: booleanField(input, "active") } });
      if (!rows[0]) throw new HttpError(404, "Birthday not found.");
      return rows[0];
    }
  }

  if (resource === "poems") {
    if (!id && request.method === "GET") return listPoems(env, identity.id);
    if (!id && request.method === "POST") {
      const input = await body(request);
      const accessType = input.access_type === undefined ? "private" : input.access_type;
      if (accessType !== "private") throw new HttpError(400, "User-added poems must be private. Public poems are curated separately.");
      const sourceUrl = stringField(input, "source_url", 2_000, false);
      if (sourceUrl && !/^https:\/\/[^\s]+$/i.test(sourceUrl)) throw new HttpError(400, "source_url must be an HTTPS URL.");
      const rows = await db<Poem[]>(env, "poems", { method: "POST", prefer: "return=representation", body: { user_id: identity.id, title: stringField(input, "title", 200), author: stringField(input, "author", 160, false), body: stringField(input, "body", 20_000), language: typeof input.language === "string" ? input.language.slice(0, 12) : "en", access_type: "private", source_type: stringField(input, "source_type", 80, false), source_title: stringField(input, "source_title", 240, false), source_section: stringField(input, "source_section", 160, false), source_page: stringField(input, "source_page", 40, false), source_url: sourceUrl, rights_note: stringField(input, "rights_note", 500, false) } });
      const poem = rows[0];
      if (!poem) throw new HttpError(502, "Poem could not be saved.");
      await attachTags(env, identity.id, poem.id, input.tags);
      return poem;
    }
    if (id && uuid.test(id) && request.method === "DELETE") {
      await db(env, "poems", { method: "DELETE", query: { id: `eq.${id}`, user_id: `eq.${identity.id}` } });
      return { ok: true };
    }
  }

  if (resource === "tags" && !id && request.method === "GET") return db<Tag[]>(env, "tags", { query: { select: "id,user_id,name,slug", or: `(user_id.eq.${identity.id},user_id.is.null)`, order: "name.asc" } });

  if (resource === "preferences" && !id) {
    if (request.method === "GET") {
      const [preferences, tagRows] = await Promise.all([
        db<WeeklyPreference[]>(env, "weekly_preferences", { query: { select: "user_id,enabled,weekday,local_time", user_id: `eq.${identity.id}`, limit: "1" } }),
        db<{ tag_id: string }[]>(env, "weekly_preference_tags", { query: { select: "tag_id", user_id: `eq.${identity.id}` } }),
      ]);
      const preference = preferences[0];
      return { enabled: preference?.enabled ?? true, weekday: preference?.weekday ?? 1, local_time: preference?.local_time ?? "08:00:00", tag_ids: tagRows.map((row) => row.tag_id) };
    }
    if (request.method === "PUT") {
      const input = await body(request);
      const localTime = stringField(input, "local_time", 8)!;
      if (!validTime(localTime)) throw new HttpError(400, "local_time is invalid.");
      const tagIds = input.tag_ids;
      if (!Array.isArray(tagIds) || tagIds.some((tagId) => typeof tagId !== "string" || !uuid.test(tagId))) throw new HttpError(400, "tag_ids is invalid.");
      await db(env, "weekly_preferences", { method: "POST", query: { on_conflict: "user_id" }, prefer: "resolution=merge-duplicates", body: { user_id: identity.id, enabled: booleanField(input, "enabled"), weekday: integerField(input, "weekday", 0, 6), local_time: localTime } });
      await db(env, "weekly_preference_tags", { method: "DELETE", query: { user_id: `eq.${identity.id}` } });
      if (tagIds.length) await db(env, "weekly_preference_tags", { method: "POST", body: tagIds.map((tagId) => ({ user_id: identity.id, tag_id: tagId })) });
      return { ok: true };
    }
  }

  if (resource === "history" && !id && request.method === "GET") return db(env, "delivery_history", { query: { select: "id,birthday_id,poem_id,delivery_type,status,scheduled_for,sent_at,error_message", user_id: `eq.${identity.id}`, order: "created_at.desc", limit: "100" } });

  throw new HttpError(404, "Not found.");
}
