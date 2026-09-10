export type Identity = { id: string; email: string; name: string | null };

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  birthday_delivery_time: string;
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
};

export type Tag = { id: string; user_id: string | null; name: string; slug: string };
export type PoemTag = { poem_id: string; tag_id: string };
export type WeeklyPreference = { user_id: string; enabled: boolean; weekday: number; local_time: string };
export type Delivery = { id: string; poem_id: string | null; sent_at: string | null; status: string };

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
