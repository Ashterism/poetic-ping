import { accessToken } from "./auth";

// Keep the hosted build functional even when Cloudflare's static deployment
// does not inject Vite environment variables.
const baseUrl = (import.meta.env.VITE_API_URL || "https://api.poetic-ping.ashterix.com").replace(/\/$/, "");

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  birthday_delivery_time: string;
};

export type Birthday = {
  id: string;
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
  title: string;
  author: string | null;
  body: string;
  language: string;
  tags: { id: string; name: string }[];
  access_type: "public" | "private";
  source_type: string | null;
  source_title: string | null;
  source_section: string | null;
  source_page: string | null;
  source_url: string | null;
  rights_note: string | null;
};

export type Preferences = {
  enabled: boolean;
  weekday: number;
  local_time: string;
  tag_ids: string[];
};

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(detail.error ?? "Request failed");
  }
  return response.json() as Promise<T>;
}
