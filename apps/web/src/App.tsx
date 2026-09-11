import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "oidc-client-ts";
import { api, Birthday, Delivery, Poem, Preferences, Profile } from "./api";
import { userManager } from "./auth";

type Dashboard = {
  profile: Profile;
  birthdays: Birthday[];
  poems: Poem[];
  preferences: Preferences;
  history: Delivery[];
};

function friendlyDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
}

function birthdayMonthDay(value: string): number {
  const [, month = "0", day = "0"] = value.split("-");
  return Number(month) * 100 + Number(day);
}

function birthdaySeason(value: string): "winter" | "spring" | "summer" | "autumn" {
  const [, month = "0"] = value.split("-");
  const number = Number(month);
  if (number === 12 || number <= 2) return "winter";
  if (number <= 5) return "spring";
  if (number <= 8) return "summer";
  return "autumn";
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  async function loadDashboard() {
    setBusy(true);
    setError("");
    try {
      const [profile, birthdays, poems, preferences, history] = await Promise.all([
        api<Profile>("/api/me"),
        api<Birthday[]>("/api/birthdays"),
        api<Poem[]>("/api/poems"),
        api<Preferences>("/api/preferences"),
        api<Delivery[]>("/api/history"),
      ]);
      setData({ profile, birthdays, poems, preferences, history });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const start = async () => {
      if (window.location.pathname === "/auth/callback") {
        await userManager.signinRedirectCallback();
        window.history.replaceState({}, "", "/");
      }
      const current = await userManager.getUser();
      setUser(current);
      if (current && !current.expired) await loadDashboard();
      else setBusy(false);
    };
    void start().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Sign-in could not be completed.");
      setBusy(false);
    });
  }, []);

  if (!user || user.expired) {
    return (
      <main className="welcome">
        <div className="moon" aria-hidden="true">☾</div>
        <p className="eyebrow">A small ritual for remembering</p>
        <h1>Poetic<br />Ping</h1>
        <p className="lede">Keep the people you love close, and let a poem find you each week.</p>
        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={() => void userManager.signinRedirect()}>Begin</button>
      </main>
    );
  }

  return (
    <div className="shell">
      <header>
        <a className="brand" href="/">Poetic Ping</a>
        <button className="text-button" onClick={() => void userManager.signoutRedirect()}>Sign out</button>
      </header>
      <main>
        <section className="hero">
          <p className="eyebrow">Your quiet corner</p>
          <h1>Remember well.<br /><em>Read slowly.</em></h1>
          <p>{data ? `Times are kept in ${data.profile.timezone}.` : "Gathering your reminders…"}</p>
        </section>
        {error && <p className="error">{error}</p>}
        {busy && <p className="loading">Opening the book…</p>}
        {data && <DashboardView data={data} refresh={loadDashboard} onError={setError} />}
      </main>
    </div>
  );
}

function DashboardView({ data, refresh, onError }: { data: Dashboard; refresh: () => Promise<void>; onError: (value: string) => void }) {
  const [tab, setTab] = useState<"birthdays" | "poems" | "settings">("birthdays");
  return (
    <>
      <nav className="tabs" aria-label="Sections">
        {(["birthdays", "poems", "settings"] as const).map((item) => (
          <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{item}</button>
        ))}
      </nav>
      {tab === "birthdays" && <Birthdays items={data.birthdays} refresh={refresh} onError={onError} />}
      {tab === "poems" && <Poems items={data.poems} refresh={refresh} onError={onError} />}
      {tab === "settings" && <Settings profile={data.profile} preferences={data.preferences} history={data.history} refresh={refresh} onError={onError} />}
    </>
  );
}

function Birthdays({ items, refresh, onError }: { items: Birthday[]; refresh: () => Promise<void>; onError: (value: string) => void }) {
  const ordered = [...items].sort((left, right) => birthdayMonthDay(left.birth_date) - birthdayMonthDay(right.birth_date));
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/birthdays", { method: "POST", body: JSON.stringify({ person_name: form.get("name"), birth_date: form.get("date"), relationship: form.get("relationship") || null, reminder_days_before: form.get("two_weeks") === "on" ? [14, 0] : [0], reminder_working_days_before: form.get("working_days") === "on" ? [3] : [] }) });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not add birthday."); }
  }
  return (
    <section className="panel-grid">
      <div className="card list-card">
        <div className="section-title"><div><p className="eyebrow">The people you hold</p><h2>Birthdays</h2></div><span>{ordered.length}</span></div>
        {ordered.length === 0 ? <p className="empty">No dates yet. Add the first person you never want to forget.</p> : ordered.map((birthday) => (
          <article className="birthday" key={birthday.id}>
            <div className={`date-tile ${birthdaySeason(birthday.birth_date)}`}><strong>{new Date(`${birthday.birth_date}T12:00:00`).getDate()}</strong><span>{new Date(`${birthday.birth_date}T12:00:00`).toLocaleString(undefined, { month: "short" })}</span></div>
            <div><h3>{birthday.person_name}</h3><p>{birthday.relationship || "Someone dear"} · {friendlyDate(birthday.birth_date)}</p></div>
            <button className="delete" aria-label={`Remove ${birthday.person_name}`} onClick={() => void api(`/api/birthdays/${birthday.id}`, { method: "DELETE" }).then(refresh).catch((cause: Error) => onError(cause.message))}>×</button>
          </article>
        ))}
      </div>
      <form className="card form-card" onSubmit={add}>
        <p className="eyebrow">Add someone</p><h2>A date to keep</h2>
        <label>Name<input name="name" required maxLength={120} placeholder="Ada" /></label>
        <label>Birthday<input name="date" type="date" required /></label>
        <label>Relationship<input name="relationship" maxLength={80} placeholder="Friend, sister, neighbour…" /></label>
        <fieldset><legend>Reminders</legend><label className="check"><input name="working_days" type="checkbox" /> 3 working days before</label><label className="check"><input name="two_weeks" type="checkbox" /> 2 weeks before</label><small>Everyone gets a reminder on the day.</small></fieldset>
        <button className="primary" type="submit">Keep this date</button>
      </form>
    </section>
  );
}

function Poems({ items, refresh, onError }: { items: Poem[]; refresh: () => Promise<void>; onError: (value: string) => void }) {
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState<"all" | "public" | "private">("all");
  const [category, setCategory] = useState("all");
  const [order, setOrder] = useState<"title" | "author" | "year" | "access">("title");
  const categories = [...new Set(items.flatMap((poem) => poem.tags.map((tag) => tag.name)))].sort();
  const visible = useMemo(() => items.filter((poem) => {
    const searchable = `${poem.title} ${poem.author ?? ""} ${poem.body} ${poem.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
    return (visibility === "all" || poem.access_type === visibility)
      && (category === "all" || poem.tags.some((tag) => tag.name === category))
      && searchable.includes(query.trim().toLowerCase());
  }).sort((left, right) => {
    if (order === "author") return (left.author ?? "").localeCompare(right.author ?? "", undefined, { sensitivity: "base" }) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    if (order === "year") return (left.attribution_year ?? Number.MAX_SAFE_INTEGER) - (right.attribution_year ?? Number.MAX_SAFE_INTEGER) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    if (order === "access") return left.access_type.localeCompare(right.access_type) || left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
    return left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
  }), [items, visibility, category, query, order]);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/poems", { method: "POST", body: JSON.stringify({ title: form.get("title"), author: form.get("author") || null, body: form.get("body"), attribution_year: form.get("attribution_year") ? Number(form.get("attribution_year")) : null, access_type: "private", source_type: form.get("source_type") || null, source_title: form.get("source_title") || null, source_section: form.get("source_section") || null, source_page: form.get("source_page") || null, source_url: form.get("source_url") || null, rights_note: form.get("rights_note") || null, tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean) }) });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save poem."); }
  }
  return (
    <section className="panel-grid">
      <div className="card list-card"><div className="section-title"><div><p className="eyebrow">Your collection</p><h2>Poems</h2></div><span>{visible.length}</span></div>
        <div className="library-filters"><input aria-label="Search poems" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, poet, category…" /><select aria-label="Access filter" value={visibility} onChange={(event) => setVisibility(event.target.value as "all" | "public" | "private")}><option value="all">All access</option><option value="public">Shared catalogue</option><option value="private">My private poems</option></select><select aria-label="Category filter" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{categories.map((name) => <option key={name}>{name}</option>)}</select><select aria-label="Sort poems" value={order} onChange={(event) => setOrder(event.target.value as "title" | "author" | "year" | "access")}><option value="title">Title A–Z</option><option value="author">Poet A–Z</option><option value="year">Year, oldest first</option><option value="access">Access type</option></select></div>
        {items.length === 0 ? <p className="empty">Your shelf is waiting for its first poem.</p> : visible.length === 0 ? <p className="empty">No poems match those filters.</p> : visible.map((poem) => <article className="poem" key={poem.id}><details><summary><div className="poem-heading"><div><h3>{poem.title}</h3><p className="byline">{[poem.author || "Unknown author", poem.attribution_year].filter(Boolean).join(" · ")}</p></div><span className={`access ${poem.access_type}`}>{poem.access_type === "public" ? "Shared" : "Private"}</span></div></summary><div className="poem-content"><p>{poem.body}</p>{(poem.source_title || poem.source_url) && <p className="source">{poem.source_title ? `Source: ${poem.source_title}` : "Source"}{poem.source_section ? ` · ${poem.source_section}` : ""}{poem.source_page ? ` · p. ${poem.source_page}` : ""}{poem.source_url && <> · <a href={poem.source_url} target="_blank" rel="noreferrer">Open source</a></>}</p>}<div className="tag-row">{poem.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div></div></details></article>)}
      </div>
      <form className="card form-card" onSubmit={add}>
        <p className="eyebrow">A new page</p><h2>Add a poem</h2>
        <label>Title<input name="title" required maxLength={200} /></label>
        <div className="two"><label>Author<input name="author" maxLength={160} /></label><label>Year<input name="attribution_year" type="number" min="1" max="2100" placeholder="e.g. 1919" /></label></div>
        <label>Poem<textarea name="body" required rows={9} /></label>
        <label>Tags<input name="tags" placeholder="hope, winter, friendship" /></label>
        <details><summary>Source details (optional)</summary><label>Source type<input name="source_type" placeholder="Book, website, anthology…" /></label><label>Book or publication<input name="source_title" /></label><div className="two"><label>Section<input name="source_section" /></label><label>Page<input name="source_page" /></label></div><label>Source URL<input name="source_url" type="url" placeholder="https://…" /></label><label>Rights note<input name="rights_note" placeholder="Personal copy, subscription, permission…" /></label></details>
        <p className="hint">Added poems are private to your account. Only curated public-domain poems are shared.</p>
        <button className="primary" type="submit">Place on shelf</button>
      </form>
    </section>
  );
}

function deliveryWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function Settings({ profile, preferences, history, refresh, onError }: { profile: Profile; preferences: Preferences; history: Delivery[]; refresh: () => Promise<void>; onError: (value: string) => void }) {
  const [sendingTest, setSendingTest] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await Promise.all([
        api("/api/me", { method: "PUT", body: JSON.stringify({ display_name: form.get("display_name") || null, timezone: form.get("timezone"), birthday_delivery_time: form.get("birthday_delivery_time"), birthday_reminders_enabled: form.get("birthday_reminders_enabled") === "on" }) }),
        api("/api/preferences", { method: "PUT", body: JSON.stringify({ enabled: form.get("enabled") === "on", weekday: Number(form.get("weekday")), local_time: form.get("local_time"), tag_ids: preferences.tag_ids }) }),
      ]);
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save settings."); }
  }
  async function sendTest(): Promise<void> {
    setSendingTest(true);
    try {
      await api("/api/test-email", { method: "POST", body: JSON.stringify({}) });
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not send a test email."); }
    finally { setSendingTest(false); }
  }
  return (
    <section className="settings-page">
      <form className="card settings" onSubmit={save}>
        <p className="eyebrow">How the notes find you</p><h2>Delivery settings</h2>
        <div className="delivery-recipient"><span>Sending to</span><strong>{profile.email}</strong><small>Your sign-in email is the delivery address.</small></div>
        <div className="two"><label>Your name<input name="display_name" defaultValue={profile.display_name ?? ""} /></label><label>Timezone<input name="timezone" defaultValue={profile.timezone} required /></label></div>
        <fieldset><legend>Birthday reminders</legend><label className="check"><input name="birthday_reminders_enabled" type="checkbox" defaultChecked={profile.birthday_reminders_enabled} /> Send me birthday reminders</label><label>Reminder time<input name="birthday_delivery_time" type="time" defaultValue={profile.birthday_delivery_time.slice(0, 5)} required /></label></fieldset>
        <fieldset><legend>Weekly poem</legend><label className="check"><input name="enabled" type="checkbox" defaultChecked={preferences.enabled} /> Send me one poem each week</label><div className="two"><label>Weekday<select name="weekday" defaultValue={preferences.weekday}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Poem time<input name="local_time" type="time" defaultValue={preferences.local_time.slice(0, 5)} required /></label></div></fieldset>
        <div className="form-actions"><button className="primary" type="submit">Save delivery settings</button><button className="secondary" type="button" onClick={() => void sendTest()} disabled={sendingTest}>{sendingTest ? "Sending…" : "Send a test email now"}</button></div>
      </form>
      <section className="card delivery-history"><p className="eyebrow">A record of each note</p><h2>Recent email activity</h2>{history.length === 0 ? <p className="empty">No emails have been sent yet.</p> : <div className="activity-list">{history.slice(0, 10).map((item) => <article className="activity" key={item.id}><div><strong>{item.delivery_type === "birthday" ? "Birthday reminder" : "Weekly poem"}</strong><p>{item.recipient_email} · {deliveryWhen(item.sent_at ?? item.scheduled_for)}</p>{item.error_message && <p className="activity-error">{item.error_message}</p>}</div><span className={`status ${item.status}`}>{item.status}</span></article>)}</div>}</section>
    </section>
  );
}
