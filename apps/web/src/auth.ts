import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const callbackUri = `${window.location.origin}/auth/callback`;
const authority = import.meta.env.VITE_ZITADEL_AUTHORITY || "https://ashterix-mkjzns.eu1.zitadel.cloud";
const clientId = import.meta.env.VITE_ZITADEL_CLIENT_ID || "390023471385649321";
const audience = import.meta.env.VITE_ZITADEL_AUDIENCE || "390021886861484201";

export const userManager = new UserManager({
  authority,
  client_id: clientId,
  redirect_uri: callbackUri,
  post_logout_redirect_uri: window.location.origin,
  response_type: "code",
  scope: `openid profile email offline_access urn:zitadel:iam:org:project:id:${audience}:aud`,
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});

export async function accessToken(): Promise<string> {
  const user = await userManager.getUser();
  if (!user || user.expired) throw new Error("Please sign in again.");
  return user.access_token;
}
