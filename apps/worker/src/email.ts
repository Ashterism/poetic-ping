import { Birthday, Poem, Profile } from "./types";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export async function sendEmail(env: Env, profile: Profile, poem: Poem | null, feedbackToken: string, birthday?: Birthday): Promise<string> {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) throw new Error("Email delivery is not configured.");
  const subject = birthday ? `${birthday.person_name}'s birthday is coming` : `Your poem for the week${poem ? ` — ${poem.title}` : ""}`;
  const intro = birthday
    ? `<p>A gentle reminder: <strong>${escape(birthday.person_name)}</strong>${birthday.relationship ? `, ${escape(birthday.relationship)}` : ""} has a birthday approaching.</p>`
    : `<p>Here is a little room in the week for you.</p>`;
  const poemHtml = poem
    ? `<hr><h2>${escape(poem.title)}</h2><p><em>${escape(poem.author ?? "Unknown author")}</em></p><p style="white-space:pre-line;line-height:1.7">${escape(poem.body)}</p>`
    : "";
  const feedbackLink = (action: "liked" | "not_for_me" | "pause_emails") => `${env.FEEDBACK_URL}?token=${encodeURIComponent(feedbackToken)}&action=${action}`;
  const feedback = `<hr style="border:0;border-top:1px solid #ded5c8;margin:30px 0 20px"><p style="margin:0 0 12px;color:#756b61">How did this land?</p><p style="margin:0"><a href="${feedbackLink("liked")}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border:1px solid #9b4c38;color:#7d3a2a;text-decoration:none">Liked this</a><a href="${feedbackLink("not_for_me")}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border:1px solid #9b4c38;color:#7d3a2a;text-decoration:none">Not for me</a><a href="${feedbackLink("pause_emails")}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 12px;border:1px solid #9b4c38;color:#7d3a2a;text-decoration:none">Pause emails</a></p>`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [profile.email], subject, html: `<div style="font-family:Georgia,serif;max-width:620px;margin:auto;color:#28241f">${intro}${poemHtml}${feedback}<p style="margin-top:32px;color:#81776d">Poetic Ping</p></div>` }),
  });
  const result = await response.json<{ id?: string; message?: string }>();
  if (!response.ok || !result.id) throw new Error(result.message ?? `Email provider returned ${response.status}.`);
  return result.id;
}
