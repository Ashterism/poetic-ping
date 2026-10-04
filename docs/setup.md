# Setup checklist

## 1. Supabase

The production project already exists:

- Organisation: `Ashterism`
- Project: `poetic-ping`
- Project ref: `cjxpbvrlwxkcmqdqdqbu`
- Region: London (`eu-west-2`)
- Project cost: `$0/month`

The initial migration is committed in `supabase/migrations`. It is also applied to the production project. Create a dedicated Supabase `sb_secret_...` key for the Worker and keep it in Worker secrets only. Never add it to Pages or any `VITE_*` variable.

## 2. ZITADEL

The production ZITADEL project and frontend application are:

- Issuer: `https://ashterix-mkjzns.eu1.zitadel.cloud`
- Project ID / API audience: `390021886861484201`
- User Agent client ID: `390023471385649321`

The **User Agent** application uses Authorization Code with PKCE, no client secret, and JWT access tokens. The frontend requests the ZITADEL project as the API audience.

For local development register:

- Redirect URI: `http://localhost:5173/auth/callback`
- Post-logout URI: `http://localhost:5173`
- Allowed origin: `http://localhost:5173`

Put the issuer, SPA client ID, and API audience into the frontend build variables and the issuer/audience into Worker variables. The audience must match on both sides.

Production ZITADEL URIs:

- Login redirect: `https://poetic-ping.ashterix.com/auth/callback`
- Post-logout redirect: `https://poetic-ping.ashterix.com`
- Allowed origin: `https://poetic-ping.ashterix.com`

The frontend requests `openid profile email offline_access` plus the ZITADEL project-audience scope. The Worker verifies issuer, audience, expiry, signature, and subject with ZITADEL's rotating JWKS endpoint.

## 3. Email

The initial provider adapter uses Resend. Verify a sending domain, then add these Worker secrets/settings:

- Secret: `RESEND_API_KEY`
- Setting: `FROM_EMAIL`, for example `Poetic Ping <reminders@your-domain.example>`

If email is not configured, the schedule still behaves safely: a delivery claim is recorded as failed and can be retried after configuration is corrected.

## 4. Cloudflare frontend

Connect `Ashterism/poetic-ping` only after the app commit is present.

- Repository path: `/`
- Build command: `npm run build:web`
- Deploy command: `npm run deploy:web`
- Production branch: `main`
- Custom domain: `poetic-ping.ashterix.com`

Add the variables from `apps/web/.env.example` with production values. Preview deployments need redirect URLs registered in ZITADEL; use a stable custom preview hostname if possible.

## 5. Cloudflare Worker and Cron

Update the placeholder values in `apps/worker/wrangler.jsonc`, then add secrets without placing them in files:

```bash
cd apps/worker
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put POETIC_PING_MCP_OAUTH_SECRET
npx wrangler types worker-configuration.d.ts
npx wrangler deploy --dry-run
```

For Cloudflare Workers Builds connected to the repository, use:

- Build command: `npm run build:worker`
- Deploy command: `npm run deploy:worker`
- Repository path: `/`

These explicit workspace commands keep the Worker build independent from the Pages frontend in the monorepo.

The checked-in schedule is every 15 minutes. Cloudflare Cron is UTC-only, so each sweep converts the instant into every user's IANA timezone. A 30-minute due window plus a unique database idempotency key protects against Cron drift and at-least-once execution.

When the dry run, test suite, and configuration values are correct, deploy the Worker. Then set `VITE_API_URL` on Pages to the Worker URL and deploy Pages.

## 6. ChatGPT MCP

The existing API Worker exposes a stateless Streamable HTTP MCP at `https://api.poetic-ping.ashterix.com/api/mcp`. It provides `search_poems`, `get_poem`, and `add_poem`; all tool calls require the existing Poetic Ping ZITADEL sign-in. The OAuth bridge uses dynamic client registration and PKCE, then reuses the existing public frontend client and its registered `https://poetic-ping.ashterix.com/auth/callback` redirect. The frontend hands only bridge-prefixed callback states back to the API. Do not register ChatGPT callback URLs in ZITADEL and do not configure bearer tokens or custom headers in ChatGPT.

`POETIC_PING_MCP_OAUTH_SECRET` is an optional, preferred dedicated encryption secret. If it is absent, the bridge derives its encrypted state/token keys from the existing server-side `SUPABASE_SECRET_KEY`; rotating whichever secret is selected requires reconnecting MCP clients. `POETIC_PING_MCP_ZITADEL_CLIENT_ID` may select another already-configured public PKCE client later, but the existing frontend client is the default and no separate MCP client is required.

In ChatGPT, use Settings > Plugins > Add > Create MCP App and point it directly to the MCP URL with automatic OAuth discovery.

## Security model

- ZITADEL is the sole user identity provider.
- The Worker is the only database client.
- The Worker derives `user_id` from the validated token subject; it never accepts a user ID from a request body.
- Supabase browser roles have no table or function grants.
- RLS is enabled on every public table as defense in depth.
- Delivery claims are atomic and repeat-safe.
- The last five successfully delivered poems are excluded where the collection is large enough; a small collection falls back gracefully rather than suppressing delivery forever.
