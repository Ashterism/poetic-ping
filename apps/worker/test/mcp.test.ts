import { beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { handleMcp } from "../src/mcp";
import { protectedResourceMetadata } from "../src/mcp-oauth";

const issuer = "https://issuer.example";
const audience = "poetic-api";
let privateKey: CryptoKey;
let jwk: Record<string, unknown>;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256", { extractable: true });
  privateKey = pair.privateKey;
  jwk = { ...await exportJWK(pair.publicKey), kid: "test", use: "sig", alg: "RS256" };
});

afterEach(() => vi.unstubAllGlobals());

const env = {
  SUPABASE_SECRET_KEY: "a-long-test-key-that-is-not-a-real-secret",
  SUPABASE_URL: "https://database.example",
  ZITADEL_ISSUER: issuer,
  ZITADEL_AUDIENCE: audience,
} as unknown as Env;

async function token(subject = "user-1") {
  return new SignJWT({ email: "reader@example.com", name: "Reader" })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer(issuer).setAudience(audience).setSubject(subject).setIssuedAt().setExpirationTime("1h").sign(privateKey);
}

function send(body: unknown, authorization = "") {
  return handleMcp(new Request("https://api.poetic-ping.ashterix.com/api/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(authorization ? { Authorization: authorization } : {}) },
    body: JSON.stringify(body),
  }), env);
}

describe("Poetic Ping MCP", () => {
  it("publishes matching discovery, negotiates initialize and lists visible tools", async () => {
    const metadata = await protectedResourceMetadata().json() as any;
    expect(metadata.resource).toBe("https://api.poetic-ping.ashterix.com/api/mcp");
    expect(metadata.authorization_servers).toEqual(["https://api.poetic-ping.ashterix.com/api/mcp/oauth"]);
    const initialized = await send({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect((await initialized.json() as any).result.protocolVersion).toBe("2025-06-18");
    const listed = await send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    const tools = (await listed.json() as any).result.tools;
    expect(tools.map((tool: any) => tool.name)).toEqual(["search_poems", "get_poem", "add_poem"]);
    expect(tools.every((tool: any) => tool._meta.ui.visibility.includes("model") && tool._meta.ui.visibility.includes("app"))).toBe(true);
    expect(tools[2].annotations.readOnlyHint).toBe(false);
  });

  it("returns the standards-compatible sign-in challenge before touching Supabase", async () => {
    const fetchMock = vi.fn(async () => Response.json({ keys: [jwk] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "search_poems", arguments: {} } });
    const body = await response.json() as any;
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"]).toEqual([response.headers.get("WWW-Authenticate")]);
    expect(response.headers.get("WWW-Authenticate")).toBe('Bearer resource_metadata="https://api.poetic-ping.ashterix.com/.well-known/oauth-protected-resource", scope="openid profile email", error="invalid_token", error_description="Sign in to Poetic Ping to continue"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("searches only shared and authenticated-user poems through the existing data layer", async () => {
    const poems = [
      { id: "11111111-1111-4111-8111-111111111111", user_id: null, title: "Shared Moon", author: "A", body: "moon", language: "en", active: true, access_type: "public", source_type: null, source_title: null, source_section: null, source_page: null, source_url: null, rights_note: null, attribution_year: null, explainer: null },
      { id: "22222222-2222-4222-8222-222222222222", user_id: "user-1", title: "Private Moon", author: "B", body: "quiet", language: "en", active: true, access_type: "private", source_type: null, source_title: null, source_section: null, source_page: null, source_url: null, rights_note: null, attribution_year: null, explainer: "moonlight" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/oauth/v2/keys")) return Response.json({ keys: [jwk] });
      if (url.pathname.endsWith("/rest/v1/poems")) {
        expect(url.searchParams.get("or")).toBe("(user_id.eq.user-1,user_id.is.null)");
        return Response.json(poems);
      }
      if (url.pathname.endsWith("/rest/v1/poem_tags")) return Response.json([]);
      throw new Error(`Unexpected fetch ${url}`);
    }));
    const response = await send({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search_poems", arguments: { query: "moon" } } }, `Bearer ${await token()}`);
    const result = (await response.json() as any).result.structuredContent;
    expect(result.count).toBe(2);
    expect(result.poems.map((poem: any) => poem.title)).toEqual(["Shared Moon", "Private Moon"]);
  });

  it("gets a poem only through the shared-or-authenticated-owner filter", async () => {
    const poem = { id: "22222222-2222-4222-8222-222222222222", user_id: "user-1", title: "Private Moon", author: "B", body: "quiet", language: "en", active: true, access_type: "private", source_type: null, source_title: null, source_section: null, source_page: null, source_url: null, rights_note: null, attribution_year: null, explainer: null };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/oauth/v2/keys")) return Response.json({ keys: [jwk] });
      if (url.pathname.endsWith("/rest/v1/poems")) {
        expect(url.searchParams.get("id")).toBe(`eq.${poem.id}`);
        expect(url.searchParams.get("or")).toBe("(user_id.eq.user-1,user_id.is.null)");
        return Response.json([poem]);
      }
      if (url.pathname.endsWith("/rest/v1/poem_tags")) return Response.json([]);
      throw new Error(`Unexpected fetch ${url}`);
    }));
    const response = await send({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_poem", arguments: { poem_id: poem.id } } }, `Bearer ${await token()}`);
    const result = (await response.json() as any).result.structuredContent;
    expect(result.poem.id).toBe(poem.id);
    expect(result.poem.user_id).toBe("user-1");
  });

  it("derives add_poem ownership from the token and rejects a supplied user_id", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/oauth/v2/keys")) return Response.json({ keys: [jwk] });
      if (url.pathname.endsWith("/rest/v1/profiles")) return Response.json([{ id: "user-1", email: "reader@example.com", display_name: "Reader", timezone: "Europe/Paris", birthday_delivery_time: "08:00:00", birthday_reminders_enabled: true }]);
      if (url.pathname.endsWith("/rest/v1/weekly_preferences")) return new Response(null, { status: 201 });
      throw new Error(`Unexpected fetch ${url} ${init?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await send({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "add_poem", arguments: { title: "Mine", body: "Text", user_id: "someone-else" } } }, `Bearer ${await token()}`);
    const result = (await response.json() as any).result;
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error).toBe("Invalid tool arguments.");
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).hostname === "database.example")).toBe(false);
  });

  it("writes a new poem as private under the authenticated subject", async () => {
    const saved = { id: "33333333-3333-4333-8333-333333333333", user_id: "user-1", title: "Mine", author: "Me", body: "Text", language: "en", active: true, access_type: "private", source_type: null, source_title: null, source_section: null, source_page: null, source_url: null, rights_note: null, attribution_year: null, explainer: null };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/oauth/v2/keys")) return Response.json({ keys: [jwk] });
      if (url.pathname.endsWith("/rest/v1/profiles")) return Response.json([{ id: "user-1", email: "reader@example.com", display_name: "Reader", timezone: "Europe/Paris", birthday_delivery_time: "08:00:00", birthday_reminders_enabled: true }]);
      if (url.pathname.endsWith("/rest/v1/weekly_preferences")) return new Response(null, { status: 201 });
      if (url.pathname.endsWith("/rest/v1/poems") && init?.method === "GET") return Response.json([]);
      if (url.pathname.endsWith("/rest/v1/poems") && init?.method === "POST") return Response.json([saved], { status: 201 });
      if (url.pathname.endsWith("/rest/v1/poem_tags")) return Response.json([]);
      throw new Error(`Unexpected fetch ${url} ${init?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await send({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "add_poem", arguments: { title: "Mine", author: "Me", body: "Text" } } }, `Bearer ${await token()}`);
    const result = (await response.json() as any).result;
    expect(result.isError).toBeUndefined();
    const insert = fetchMock.mock.calls.find(([input, init]) => new URL(String(input)).pathname.endsWith("/rest/v1/poems") && init?.method === "POST");
    const payload = JSON.parse(String(insert?.[1]?.body));
    expect(payload.user_id).toBe("user-1");
    expect(payload.access_type).toBe("private");
  });
});
