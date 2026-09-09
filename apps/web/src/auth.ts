import { UserManager, WebStorageStateStore } from "oidc-client-ts";

const callbackUri = `${window.location.origin}/auth/callback`;

export const userManager = new UserManager({
  authority: import.meta.env.VITE_ZITADEL_AUTHORITY,
  client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
  redirect_uri: callbackUri,
  post_logout_redirect_uri: window.location.origin,
  response_type: "code",
  scope: `openid profile email offline_access urn:zitadel:iam:org:project:id:${import.meta.env.VITE_ZITADEL_AUDIENCE}:aud`,
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
});

export async function accessToken(): Promise<string> {
  const user = await userManager.getUser();
  if (!user || user.expired) throw new Error("Please sign in again.");
  return user.access_token;
}
