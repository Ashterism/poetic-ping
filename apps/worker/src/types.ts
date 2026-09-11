export type Identity = { id: string; email: string; name: string | null };

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  birthday_delivery_time: string;
  birthday_reminders_enabled: boolean;
};

export type Birthday = {
  id: string;
  user_id: string;
  person_name: string;
  birth_date: string;
  relationship: string | null;
  notes: string | null;
  reminder_days_before: number[];
  reminder_working_days_before: number[];
  active: boolean;
};

export type Poem = {
  id: string;
  user_id: string | null;
  title: string;
  author: string | null;
  body: string;
  language: string;
  active: boolean;
  access_type: "public" | "private";
  source_type: string | null;
  source_title: string | null;
  source_section: string | null;
  source_page: string | null;
  source_url: string | null;
  rights_note: string | null;
  attribution_year: number | null;
};

export type Tag = { id: string; user_id: string | null; name: string; slug: string };
export type PoemTag = { poem_id: string; tag_id: string };
export type WeeklyPreference = { user_id: string; enabled: boolean; weekday: number; local_time: string };
export type Delivery = { id: string; poem_id: string | null; sent_at: string | null; status: string };

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
