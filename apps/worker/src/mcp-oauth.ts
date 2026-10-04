import { authenticate } from "./auth";
import { HttpError, Identity } from "./types";

export const API_ORIGIN = "https://api.poetic-ping.ashterix.com";
export const FRONTEND_ORIGIN = "https://poetic-ping.ashterix.com";
export const RESOURCE = `${API_ORIGIN}/api/mcp`;
export const OAUTH_ISSUER = `${RESOURCE}/oauth`;
const FRONTEND_CALLBACK = `${FRONTEND_ORIGIN}/auth/callback`;
const COOKIE = "__Host-poetic-ping-mcp-oauth";
const SCOPES = ["openid", "profile", "email", "offline_access"];
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
const decode = (value: string) => Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (character) => character.charCodeAt(0));
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
const hash = async (value: string) => encode(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

const json = (body: unknown, status = 200, extra: HeadersInit = {}) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store", ...extra },
});
const oauthError = (name: string, status = 400, description?: string) => json({ error: name, ...(description ? { error_description: description } : {}) }, status);
const redirect = (location: string, extra: HeadersInit = {}) => new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", ...extra } });
const upstreamClientId = (env: Env) => env.POETIC_PING_MCP_ZITADEL_CLIENT_ID || "390023471385649321";
const upstreamIssuer = (env: Env) => env.ZITADEL_ISSUER.replace(/\/$/, "");

function configured(env: Env): boolean {
  const secret = env.POETIC_PING_MCP_OAUTH_SECRET || env.SUPABASE_SECRET_KEY;
  return typeof secret === "string" && secret.length >= 32;
}

async function key(env: Env, purpose: string): Promise<CryptoKey> {
  const secret = env.POETIC_PING_MCP_OAUTH_SECRET || env.SUPABASE_SECRET_KEY;
  if (!configured(env)) throw new Error("OAuth is not configured");
  const material = await crypto.subtle.importKey("raw", encoder.encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode(RESOURCE), info: encoder.encode(`poetic-ping-mcp-oauth:${purpose}`) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(env: Env, purpose: string, claims: Record<string, unknown>): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await key(env, purpose),
    encoder.encode(JSON.stringify({ ...claims, aud: RESOURCE })),
  ));
  const bytes = new Uint8Array(iv.length + ciphertext.length);
  bytes.set(iv);
  bytes.set(ciphertext, iv.length);
  return `poetic_${purpose}_${encode(bytes)}`;
}

async function open(env: Env, purpose: string, value: unknown): Promise<Record<string, any> | null> {
  try {
    const prefix = `poetic_${purpose}_`;
    if (typeof value !== "string" || value.length > 32_000 || !value.startsWith(prefix)) return null;
    const bytes = decode(value.slice(prefix.length));
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await key(env, purpose), bytes.slice(12));
    const claims = JSON.parse(new TextDecoder().decode(plaintext));
    return claims.aud === RESOURCE && Number.isFinite(claims.exp) && claims.exp > now() ? claims : null;
  } catch {
    return null;
  }
}

function validRedirect(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 512) return false;
  try {
    const url = new URL(value);
    return !url.hash && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)));
  } catch {
    return false;
  }
}

async function readBody(request: Request, limit = 32_768): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function oauthMetadata(): Response {
  return json({
    issuer: OAUTH_ISSUER,
    authorization_endpoint: `${OAUTH_ISSUER}/authorize`,
    token_endpoint: `${OAUTH_ISSUER}/token`,
    registration_endpoint: `${OAUTH_ISSUER}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: SCOPES,
    authorization_response_iss_parameter_supported: true,
  });
}

export function protectedResourceMetadata(): Response {
  return json({
    resource: RESOURCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
  }, 200, { "Cache-Control": "public, max-age=300" });
}

async function register(request: Request, env: Env): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(request, 8_192));
  } catch {
    return oauthError("invalid_client_metadata");
  }
  const redirects = body.redirect_uris;
  if (!Array.isArray(redirects) || !redirects.length || redirects.length > 3 || !redirects.every(validRedirect)) return oauthError("invalid_redirect_uri");
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none") return oauthError("invalid_client_metadata");
  if (body.grant_types && (!Array.isArray(body.grant_types) || body.grant_types.some((grant) => !["authorization_code", "refresh_token"].includes(String(grant))))) return oauthError("invalid_client_metadata");
  if (body.response_types && (!Array.isArray(body.response_types) || body.response_types.some((type) => type !== "code"))) return oauthError("invalid_client_metadata");
  const name = typeof body.client_name === "string" ? body.client_name.slice(0, 200) : "MCP client";
  const id = await seal(env, "client", { redirects, name, nonce: random(), exp: now() + 365 * 86_400 });
  return json({ client_id: id, client_id_issued_at: now(), redirect_uris: redirects, client_name: name, token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] }, 201);
}

function cookieName(flow: unknown): string {
  return typeof flow === "string" && /^[A-Za-z0-9_-]{16}$/.test(flow) ? `${COOKIE}-${flow}` : COOKIE;
}

function readCookie(request: Request, flow: unknown): string {
  const name = cookieName(flow);
  return (request.headers.get("Cookie") || "").split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

const cookieHeader = (value: string, flow: unknown) => `${cookieName(flow)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${value ? 600 : 0}`;

function sameOriginSubmission(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin === API_ORIGIN) return true;
  if (origin && origin !== "null") return false;
  if (request.headers.get("Sec-Fetch-Site") === "same-origin") return true;
  try {
    return new URL(request.headers.get("Referer")!).origin === API_ORIGIN;
  } catch {
    return false;
  }
}

async function browserStateError(request: Request, state: Record<string, any> | null): Promise<Response | null> {
  if (!state) return oauthError("invalid_request", 400, "This sign-in attempt expired or is invalid. Start Authenticate again from ChatGPT.");
  const value = readCookie(request, state.flow);
  if (!value) return oauthError("invalid_request", 400, "The sign-in cookie is missing. Open a fresh Authenticate link in the same browser and allow cookies for api.poetic-ping.ashterix.com.");
  if (state.browser !== await hash(value)) return oauthError("invalid_request", 400, "This sign-in page belongs to a different browser attempt. Start Authenticate again from ChatGPT.");
  return null;
}

async function authorize(request: Request, env: Env): Promise<Response> {
  if (request.method === "POST") {
    if (!sameOriginSubmission(request)) return oauthError("invalid_request", 400, "The browser did not identify this submission as coming from Poetic Ping. Start Authenticate again from ChatGPT.");
    if (!(request.headers.get("Content-Type") || "").startsWith("application/x-www-form-urlencoded")) return oauthError("invalid_request", 400, "The consent form was submitted in an unsupported format.");
    let form: URLSearchParams;
    try {
      form = new URLSearchParams(await readBody(request));
    } catch {
      return oauthError("invalid_request");
    }
    const value = form.get("authorization_request");
    const state = await open(env, "state", value);
    const invalidState = await browserStateError(request, state);
    if (invalidState) return invalidState;
    const provider = new URL(`${upstreamIssuer(env)}/oauth/v2/authorize`);
    provider.search = new URLSearchParams({
      client_id: state!.upstreamClient,
      redirect_uri: FRONTEND_CALLBACK,
      response_type: "code",
      scope: `${state!.scope} urn:zitadel:iam:org:project:id:${env.ZITADEL_AUDIENCE}:aud`,
      code_challenge: await hash(state!.verifier),
      code_challenge_method: "S256",
      state: value!,
    }).toString();
    return redirect(provider.toString());
  }

  const params = new URL(request.url).searchParams;
  const client = await open(env, "client", params.get("client_id"));
  const redirectUri = params.get("redirect_uri");
  if (!client || !client.redirects.includes(redirectUri)) return oauthError("invalid_client");
  if (params.get("response_type") !== "code") return oauthError("unsupported_response_type");
  if (params.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(params.get("code_challenge") || "")) return oauthError("invalid_request");
  if (params.has("resource") && params.get("resource") !== RESOURCE) return oauthError("invalid_target");
  const scopes = [...new Set((params.get("scope") || "openid profile email").split(" ").filter(Boolean))];
  if (scopes.some((scope) => !SCOPES.includes(scope)) || !scopes.includes("openid") || (params.get("state") || "").length > 1_024) return oauthError("invalid_scope");
  const browser = random();
  const flow = random().slice(0, 16);
  const state = await seal(env, "state", {
    client: params.get("client_id"), redirect: redirectUri, state: params.get("state"),
    challenge: params.get("code_challenge"), scope: scopes.join(" "), verifier: random(),
    upstreamClient: upstreamClientId(env), browser: await hash(browser), flow, exp: now() + 600,
  });
  const page = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Poetic Ping</title><style>body{font:16px system-ui;background:#f6f1e8;color:#28241f;max-width:36rem;margin:12vh auto;padding:1.5rem;line-height:1.6}button,a{font:inherit;color:#8b3f2b}button{background:#fffaf2;border:1px solid #8b3f2b;border-radius:.5rem;padding:.7rem 1rem;cursor:pointer}a{margin-left:1rem}</style><h1>Connect Poetic Ping</h1><p>Allow <strong>${escapeHtml(client.name)}</strong> to search and read your accessible poems, and add private poems when you ask.</p><p>You will sign in with your existing Poetic Ping account. Your connection will return to <strong>${escapeHtml(new URL(redirectUri!).host)}</strong>.</p><form method="post" action="/api/mcp/oauth/authorize"><input type="hidden" name="authorization_request" value="${escapeHtml(state)}"><button type="submit">Connect and sign in</button><a href="${FRONTEND_ORIGIN}">Cancel</a></form></html>`;
  return new Response(page, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Set-Cookie": cookieHeader(browser, flow),
    "Referrer-Policy": "strict-origin", "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${upstreamIssuer(env)}; frame-ancestors 'none'; base-uri 'none'`,
    "X-Content-Type-Options": "nosniff",
  } });
}

export async function oauthCallback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const state = await open(env, "state", params.get("state"));
  const invalidState = await browserStateError(request, state);
  if (invalidState) return invalidState;
  const target = new URL(state!.redirect);
  target.searchParams.set("iss", OAUTH_ISSUER);
  if (state!.state !== null) target.searchParams.set("state", state!.state);
  if (params.has("error")) {
    target.searchParams.set("error", "access_denied");
  } else {
    if (!params.get("code") || params.get("code")!.length > 4_096 || (params.has("iss") && params.get("iss") !== upstreamIssuer(env))) return oauthError("invalid_request");
    const code = await seal(env, "code", {
      client: state!.client, redirect: state!.redirect, challenge: state!.challenge, scope: state!.scope,
      verifier: state!.verifier, upstreamClient: state!.upstreamClient, upstreamCode: params.get("code"), exp: now() + 120,
    });
    target.searchParams.set("code", code);
  }
  return redirect(target.toString(), { "Set-Cookie": cookieHeader("", state!.flow) });
}

async function validateIdentity(env: Env, token: string): Promise<Identity> {
  return authenticate(new Request(RESOURCE, { headers: { Authorization: `Bearer ${token}` } }), env);
}

async function token(request: Request, env: Env): Promise<Response> {
  if (!(request.headers.get("Content-Type") || "").startsWith("application/x-www-form-urlencoded")) return oauthError("invalid_request");
  let form: URLSearchParams;
  try {
    form = new URLSearchParams(await readBody(request));
  } catch {
    return oauthError("invalid_request");
  }
  const id = form.get("client_id");
  if (!await open(env, "client", id)) return oauthError("invalid_client");
  if (form.has("resource") && form.get("resource") !== RESOURCE) return oauthError("invalid_target");
  const grant = form.get("grant_type");
  if (!grant || !["authorization_code", "refresh_token"].includes(grant)) return oauthError("unsupported_grant_type");
  const claims = await open(env, grant === "refresh_token" ? "refresh" : "code", form.get(grant === "refresh_token" ? "refresh_token" : "code"));
  if (!claims || claims.client !== id) return oauthError("invalid_grant");
  let upstream: Record<string, string>;
  if (grant === "authorization_code") {
    const verifier = form.get("code_verifier") || "";
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || claims.redirect !== form.get("redirect_uri") || claims.challenge !== await hash(verifier)) return oauthError("invalid_grant");
    upstream = { grant_type: grant, code: claims.upstreamCode, code_verifier: claims.verifier, redirect_uri: FRONTEND_CALLBACK };
  } else {
    if (form.has("scope") && form.get("scope") !== claims.scope) return oauthError("invalid_scope");
    upstream = { grant_type: grant, refresh_token: claims.upstreamToken };
  }
  let tokens: Record<string, unknown>;
  try {
    const response = await fetch(`${upstreamIssuer(env)}/oauth/v2/token`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: claims.upstreamClient, ...upstream }), signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return oauthError("invalid_grant");
    tokens = await response.json() as Record<string, unknown>;
  } catch {
    return oauthError("temporarily_unavailable", 503);
  }
  if (typeof tokens.access_token !== "string" || tokens.access_token.length > 12_000 || !Number.isFinite(Number(tokens.expires_in)) || Number(tokens.expires_in) <= 0) return oauthError("invalid_grant");
  try {
    await validateIdentity(env, tokens.access_token);
  } catch (cause) {
    return oauthError(cause instanceof HttpError && cause.status === 403 ? "access_denied" : "invalid_grant");
  }
  const seconds = Math.min(Number(tokens.expires_in), 3_600);
  const accessToken = await seal(env, "access", { client: id, scope: claims.scope, upstreamToken: tokens.access_token, exp: now() + seconds });
  const refreshToken = typeof tokens.refresh_token === "string" && tokens.refresh_token.length <= 12_000
    ? await seal(env, "refresh", { client: id, scope: claims.scope, upstreamClient: claims.upstreamClient, upstreamToken: tokens.refresh_token, exp: now() + 30 * 86_400 })
    : undefined;
  return json({ access_token: accessToken, token_type: "Bearer", expires_in: seconds, scope: claims.scope, ...(refreshToken ? { refresh_token: refreshToken } : {}) }, 200, { Pragma: "no-cache" });
}

export async function authorizeMcpRequest(request: Request, env: Env): Promise<{ identity?: Identity; error?: string; status?: number }> {
  const bearer = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1];
  let token = bearer;
  if (bearer?.startsWith("poetic_")) {
    const claims = await open(env, "access", bearer);
    if (!claims || typeof claims.upstreamToken !== "string") return { error: "unauthorized", status: 401 };
    token = claims.upstreamToken;
  }
  try {
    const identity = await validateIdentity(env, token || "");
    return { identity };
  } catch (cause) {
    return { error: cause instanceof HttpError ? cause.message : "unauthorized", status: cause instanceof HttpError ? cause.status : 401 };
  }
}

export async function handleOAuth(request: Request, env: Env, action: string): Promise<Response> {
  if (action === "callback") return request.method === "GET" ? oauthCallback(request, env) : oauthError("method_not_allowed", 405);
  const allowed = action === "authorize" ? ["GET", "POST"] : ["POST"];
  if (!["register", "authorize", "token"].includes(action)) return oauthError("not_found", 404);
  if (!allowed.includes(request.method)) return json({ error: "method_not_allowed" }, 405, { Allow: allowed.join(", ") });
  if (!configured(env)) return oauthError("oauth_not_configured", 503);
  try {
    if (action === "register") return register(request, env);
    if (action === "authorize") return authorize(request, env);
    return token(request, env);
  } catch {
    return oauthError("temporarily_unavailable", 503);
  }
}
