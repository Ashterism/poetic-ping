import { HttpError } from "./types";

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Expected a JSON object.");
  return value as Record<string, unknown>;
}

export function stringField(body: Record<string, unknown>, key: string, max: number, required = true): string | null {
  const value = body[key];
  if ((value === null || value === undefined || value === "") && !required) return null;
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, `${key} is required.`);
  if (value.length > max) throw new HttpError(400, `${key} is too long.`);
  return value.trim();
}

export function booleanField(body: Record<string, unknown>, key: string): boolean {
  if (typeof body[key] !== "boolean") throw new HttpError(400, `${key} must be true or false.`);
  return body[key];
}

export function integerField(body: Record<string, unknown>, key: string, min: number, max: number): number {
  const value = body[key];
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) throw new HttpError(400, `${key} is invalid.`);
  return value as number;
}

export function validDate(value: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
export function validTime(value: string): boolean { return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value); }

export function assertTimezone(value: string): void {
  try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); }
  catch { throw new HttpError(400, "timezone must be a valid IANA timezone, such as Europe/London."); }
}

export function slug(value: string): string {
  const result = value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!result) throw new HttpError(400, "A tag must contain letters or numbers.");
  return result.slice(0, 80);
}
