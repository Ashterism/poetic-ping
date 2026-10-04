import { afterEach, describe, expect, it } from "vitest";
import { API_ORIGIN, FRONTEND_ORIGIN, OAUTH_ISSUER, RESOURCE, handleOAuth, oauthMetadata } from "../src/mcp-oauth";

const env = {
  SUPABASE_SECRET_KEY: "a-long-test-key-that-is-not-a-real-secret",
  ZITADEL_ISSUER: "https://ashterix-mkjzns.eu1.zitadel.cloud",
  ZITADEL_AUDIENCE: "390021886861484201",
} as unknown as Env;
const callback = "https://chat.example/oauth/callback";
const verifier = "v".repeat(43);
const challenge = async (value: string) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const request = (action: string, options: RequestInit = {}, runtime = env) => handleOAuth(new Request(`${OAUTH_ISSUER}/${action}`, options), runtime, action.split("?")[0]!);
const register = async (details: Record<string, unknown> = {}, runtime = env) => (await request("register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "ChatGPT", redirect_uris: [callback], ...details }) }, runtime)).json() as Promise<any>;

afterEach(() => {});

describe("Poetic Ping MCP OAuth bridge", () => {
  it("advertises DCR, PKCE, issuer identification and the existing scopes", async () => {
    const metadata = await oauthMetadata().json() as any;
    expect(metadata.issuer).toBe(OAUTH_ISSUER);
    expect(metadata.registration_endpoint).toBe(`${OAUTH_ISSUER}/register`);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.authorization_response_iss_parameter_supported).toBe(true);
    expect(metadata.scopes_supported).toEqual(["openid", "profile", "email", "offline_access"]);
  });

  it("fails closed without server encryption material and rejects unsafe redirects", async () => {
    expect((await register({}, {} as Env)).error).toBe("oauth_not_configured");
    for (const redirectUri of ["http://remote.example/callback", "javascript:alert(1)", "https://user:password@example.com", "https://example.com/#fragment"]) {
      expect((await register({ redirect_uris: [redirectUri] })).error).toBe("invalid_redirect_uri");
    }
    expect((await register({ token_endpoint_auth_method: "client_secret_basic" })).error).toBe("invalid_client_metadata");
    expect((await register({ redirect_uris: ["http://127.0.0.1:3000/callback"] })).client_id).toMatch(/^poetic_client_/);
  });

  it("uses the existing Poetic Ping PKCE client and frontend callback", async () => {
    const client = await register();
    const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback, response_type: "code", scope: "openid profile email offline_access", state: "chatgpt-state", resource: RESOURCE, code_challenge: await challenge(verifier), code_challenge_method: "S256" });
    const consent = await request(`authorize?${params}`);
    expect(consent.status).toBe(200);
    expect(consent.headers.get("Referrer-Policy")).toBe("strict-origin");
    expect(consent.headers.get("Content-Security-Policy")).toContain("form-action 'self' https://ashterix-mkjzns.eu1.zitadel.cloud");
    const page = await consent.text();
    const state = page.match(/name="authorization_request" value="([^"]+)"/)?.[1];
    expect(state).toMatch(/^poetic_state_/);
    const cookie = consent.headers.get("Set-Cookie")!.split(";")[0]!;
    const login = await request("authorize", { method: "POST", headers: { Cookie: cookie, Origin: API_ORIGIN, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ authorization_request: state! }) });
    expect(login.status).toBe(302);
    const provider = new URL(login.headers.get("Location")!);
    expect(provider.searchParams.get("client_id")).toBe("390023471385649321");
    expect(provider.searchParams.get("redirect_uri")).toBe(`${FRONTEND_ORIGIN}/auth/callback`);
    expect(provider.searchParams.get("scope")).toContain("urn:zitadel:iam:org:project:id:390021886861484201:aud");
    expect(provider.searchParams.get("code_challenge")).not.toBe(await challenge(verifier));
  });
});
