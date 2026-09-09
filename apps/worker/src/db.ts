import { HttpError } from "./types";

type DbOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string;
};

export async function db<T>(env: Env, path: string, options: DbOptions = {}): Promise<T> {
  const url = new URL(`/rest/v1/${path}`, env.SUPABASE_URL);
  for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      "Content-Type": "application/json",
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error(JSON.stringify({ message: "Supabase request failed", path, status: response.status, detail: text.slice(0, 500) }));
    throw new HttpError(502, "The database request failed.");
  }
  if (response.status === 204) return undefined as T;
  if ((options.method ?? "GET") !== "GET") {
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return response.json() as Promise<T>;
}

export async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  return db<T>(env, `rpc/${name}`, { method: "POST", body });
}
