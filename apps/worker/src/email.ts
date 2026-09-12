import { Birthday, Poem, Profile } from "./types";

function escape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

export async function sendEmail(env: Env, profile: Profile, poem: Poem | null, birthday?: Birthday): Promise<string> {
  if (!env.RESEND_API_KEY || !env.FROM_EMAIL) throw new Error("Email delivery is not configured.");
  const subject = birthday ? `${birthday.person_name}'s birthday is coming` : `Your poem for the week${poem ? ` — ${poem.title}` : ""}`;
  const intro = birthday
    ? `<p>A gentle reminder: <strong>${escape(birthday.person_name)}</strong>${birthday.relationship ? `, ${escape(birthday.relationship)}` : ""} has a birthday approaching.</p>`
    : `<p>Here is a little room in the week for you.</p>`;
  const poemHtml = poem
    ? `<hr><h2>${escape(poem.title)}</h2><p><em>${escape(poem.author ?? "Unknown author")}</em></p><p style="white-space:pre-line;line-height:1.7">${escape(poem.body)}</p>`
    : "";
  const feedback = env.FEEDBACK_EMAIL
    ? `<p style="margin-top:26px"><a href="mailto:${encodeURIComponent(env.FEEDBACK_EMAIL)}?subject=${encodeURIComponent("Poetic Ping feedback")}" style="color:#7d3a2a">Share feedback</a></p>`
    : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [profile.email], subject, html: `<div style="font-family:Georgia,serif;max-width:620px;margin:auto;color:#28241f">${intro}${poemHtml}${feedback}<p style="margin-top:32px;color:#81776d">Poetic Ping</p></div>` }),
  });
  const result = await response.json<{ id?: string; message?: string }>();
  if (!response.ok || !result.id) throw new Error(result.message ?? `Email provider returned ${response.status}.`);
  return result.id;
}
