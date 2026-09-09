import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { HttpError, Identity } from "./types";

const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function bearer(request: Request): string {
  const value = request.headers.get("Authorization");
  if (!value?.startsWith("Bearer ")) throw new HttpError(401, "Sign in is required.");
  return value.slice(7);
}

async function userInfo(env: Env, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${env.ZITADEL_ISSUER.replace(/\/$/, "")}/oidc/v1/userinfo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new HttpError(401, "The sign-in token is no longer valid.");
  return response.json() as Promise<Record<string, unknown>>;
}

function textClaim(payload: JWTPayload | Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function authenticate(request: Request, env: Env): Promise<Identity> {
  const token = bearer(request);
  const issuer = env.ZITADEL_ISSUER.replace(/\/$/, "");
  let jwks = jwksByIssuer.get(issuer);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/oauth/v2/keys`));
    jwksByIssuer.set(issuer, jwks);
  }
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwks, { issuer, audience: env.ZITADEL_AUDIENCE }));
  } catch (cause) {
    console.warn(JSON.stringify({ message: "ZITADEL token rejected", reason: cause instanceof Error ? cause.message : "unknown" }));
    throw new HttpError(401, "The sign-in token is invalid or expired.");
  }
  if (!payload.sub) throw new HttpError(401, "The sign-in token has no subject.");
  const claims = textClaim(payload, "email") ? payload : await userInfo(env, token);
  const email = textClaim(claims, "email");
  if (!email) throw new HttpError(403, "Your ZITADEL profile must include an email address.");
  return { id: payload.sub, email, name: textClaim(claims, "name") };
}
