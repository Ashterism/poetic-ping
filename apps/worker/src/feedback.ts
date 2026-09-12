import { db } from "./db";

const token = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actions = new Set(["liked", "not_for_me", "pause_emails"]);

function page(title: string, message: string): Response {
  return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Poetic Ping</title><body style="margin:0;background:#f6f1e8;color:#28241f;font-family:Georgia,serif"><main style="max-width:560px;margin:20vh auto;padding:36px"><p style="letter-spacing:.16em;color:#a34e37;font:600 12px system-ui">POETIC PING</p><h1 style="font-size:42px;margin:8px 0">${title}</h1><p style="font-size:19px;line-height:1.5">${message}</p></main></body></html>`, { headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" } });
}

export async function recordEmailFeedback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const feedbackToken = url.searchParams.get("token") ?? "";
  const action = url.searchParams.get("action") ?? "";
  if (!token.test(feedbackToken) || !actions.has(action)) return page("That link is not available.", "Please return to your latest Poetic Ping email.");

  const rows = await db<Array<{ id: string; user_id: string; feedback_action: string | null }>>(env, "delivery_history", { query: { select: "id,user_id,feedback_action", feedback_token: `eq.${feedbackToken}`, limit: "1" } });
  const delivery = rows[0];
  if (!delivery) return page("That link is not available.", "Please return to your latest Poetic Ping email.");
  if (delivery.feedback_action) return page("Already noted.", "Thank you — your earlier choice has been kept.");

  await db(env, "delivery_history", { method: "PATCH", query: { id: `eq.${delivery.id}` }, body: { feedback_action: action, feedback_at: new Date().toISOString() } });
  if (action === "pause_emails") {
    await Promise.all([
      db(env, "profiles", { method: "PATCH", query: { id: `eq.${delivery.user_id}` }, body: { birthday_reminders_enabled: false } }),
      db(env, "weekly_preferences", { method: "PATCH", query: { user_id: `eq.${delivery.user_id}` }, body: { enabled: false } }),
    ]);
    return page("Emails paused.", "Birthday reminders and weekly poems are paused. You can turn them back on in Poetic Ping Settings whenever you like.");
  }
  return page(action === "liked" ? "Lovely — noted." : "Noted.", action === "liked" ? "We’ll use this to guide future poem suggestions." : "This poem will not be selected for you again.");
}
