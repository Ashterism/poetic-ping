import { FormEvent, useEffect, useState } from "react";
import type { User } from "oidc-client-ts";
import { api, Birthday, Poem, Preferences, Profile } from "./api";
import { userManager } from "./auth";

type Dashboard = {
  profile: Profile;
  birthdays: Birthday[];
  poems: Poem[];
  preferences: Preferences;
};

function friendlyDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long" }).format(
    new Date(`${value}T12:00:00`),
  );
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
      const [profile, birthdays, poems, preferences] = await Promise.all([
        api<Profile>("/api/me"),
        api<Birthday[]>("/api/birthdays"),
        api<Poem[]>("/api/poems"),
        api<Preferences>("/api/preferences"),
      ]);
      setData({ profile, birthdays, poems, preferences });
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
        <h1>Poetic<br />Reminder</h1>
        <p className="lede">Keep the people you love close, and let a poem find you each week.</p>
        {error && <p className="error">{error}</p>}
        <button className="primary" onClick={() => void userManager.signinRedirect()}>Begin</button>
      </main>
    );
  }

  return (
    <div className="shell">
      <header>
        <a className="brand" href="/">Poetic Reminder</a>
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
      {tab === "settings" && <Settings profile={data.profile} preferences={data.preferences} refresh={refresh} onError={onError} />}
    </>
  );
}

function Birthdays({ items, refresh, onError }: { items: Birthday[]; refresh: () => Promise<void>; onError: (value: string) => void }) {
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/birthdays", { method: "POST", body: JSON.stringify({ person_name: form.get("name"), birth_date: form.get("date"), relationship: form.get("relationship") || null, reminder_days_before: [7, 0] }) });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not add birthday."); }
  }
  return (
    <section className="panel-grid">
      <div className="card list-card">
        <div className="section-title"><div><p className="eyebrow">The people you hold</p><h2>Birthdays</h2></div><span>{items.length}</span></div>
        {items.length === 0 ? <p className="empty">No dates yet. Add the first person you never want to forget.</p> : items.map((birthday) => (
          <article className="birthday" key={birthday.id}>
            <div className="date-tile"><strong>{new Date(`${birthday.birth_date}T12:00:00`).getDate()}</strong><span>{new Date(`${birthday.birth_date}T12:00:00`).toLocaleString(undefined, { month: "short" })}</span></div>
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
        <button className="primary" type="submit">Keep this date</button>
      </form>
    </section>
  );
}

function Poems({ items, refresh, onError }: { items: Poem[]; refresh: () => Promise<void>; onError: (value: string) => void }) {
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/poems", { method: "POST", body: JSON.stringify({ title: form.get("title"), author: form.get("author") || null, body: form.get("body"), tags: String(form.get("tags") || "").split(",").map((tag) => tag.trim()).filter(Boolean) }) });
      event.currentTarget.reset();
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save poem."); }
  }
  return (
    <section className="panel-grid">
      <div className="card list-card"><div className="section-title"><div><p className="eyebrow">Your collection</p><h2>Poems</h2></div><span>{items.length}</span></div>
        {items.length === 0 ? <p className="empty">Your shelf is waiting for its first poem.</p> : items.map((poem) => <article className="poem" key={poem.id}><h3>{poem.title}</h3><p className="byline">{poem.author || "Unknown author"}</p><p>{poem.body}</p><div className="tag-row">{poem.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div></article>)}
      </div>
      <form className="card form-card" onSubmit={add}>
        <p className="eyebrow">A new page</p><h2>Add a poem</h2>
        <label>Title<input name="title" required maxLength={200} /></label>
        <label>Author<input name="author" maxLength={160} /></label>
        <label>Poem<textarea name="body" required rows={9} /></label>
        <label>Tags<input name="tags" placeholder="hope, winter, friendship" /></label>
        <button className="primary" type="submit">Place on shelf</button>
      </form>
    </section>
  );
}

function Settings({ profile, preferences, refresh, onError }: { profile: Profile; preferences: Preferences; refresh: () => Promise<void>; onError: (value: string) => void }) {
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await Promise.all([
        api("/api/me", { method: "PUT", body: JSON.stringify({ display_name: form.get("display_name") || null, timezone: form.get("timezone"), birthday_delivery_time: form.get("birthday_delivery_time") }) }),
        api("/api/preferences", { method: "PUT", body: JSON.stringify({ enabled: form.get("enabled") === "on", weekday: Number(form.get("weekday")), local_time: form.get("local_time"), tag_ids: preferences.tag_ids }) }),
      ]);
      await refresh();
    } catch (cause) { onError(cause instanceof Error ? cause.message : "Could not save settings."); }
  }
  return (
    <form className="card settings" onSubmit={save}>
      <p className="eyebrow">How the notes find you</p><h2>Delivery settings</h2>
      <div className="two"><label>Your name<input name="display_name" defaultValue={profile.display_name ?? ""} /></label><label>Email<input value={profile.email} disabled /></label></div>
      <div className="two"><label>IANA timezone<input name="timezone" defaultValue={profile.timezone} required /></label><label>Birthday reminder time<input name="birthday_delivery_time" type="time" defaultValue={profile.birthday_delivery_time.slice(0, 5)} required /></label></div>
      <label className="check"><input name="enabled" type="checkbox" defaultChecked={preferences.enabled} /> Send me one poem each week</label>
      <div className="two"><label>Weekday<select name="weekday" defaultValue={preferences.weekday}>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label>Poem time<input name="local_time" type="time" defaultValue={preferences.local_time.slice(0, 5)} required /></label></div>
      <button className="primary" type="submit">Save settings</button>
    </form>
  );
}
