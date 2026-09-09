# Setup checklist

## 1. Supabase

The production project already exists:

- Organisation: `Ashterism`
- Project: `poetic-ping`
- Project ref: `cjxpbvrlwxkcmqdqdqbu`
- Region: London (`eu-west-2`)
- Project cost: `$0/month`

The initial migration is committed in `supabase/migrations`. It is also applied to the production project. Keep the service-role key in Worker secrets only. Never add it to Pages or any `VITE_*` variable.

## 2. ZITADEL

Create or reuse a ZITADEL project, then create two applications:

1. A **User Agent** application for the React SPA. Choose Authorization Code with PKCE and JWT access tokens.
2. An **API** application representing the Worker. Use its project/app identifier as the audience.

For local development register:

- Redirect URI: `http://localhost:5173/auth/callback`
- Post-logout URI: `http://localhost:5173`
- Allowed origin: `http://localhost:5173`

After the Pages hostname is known, add its HTTPS equivalents. Put the issuer, SPA client ID, and API audience into the frontend build variables and the issuer/audience into Worker variables. The audience must match on both sides.

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

## 4. Cloudflare Pages

Connect `Ashterism/poetic-ping` only after the app commit is present.

- Root directory: `apps/web`
- Build command: `npm ci && npm run build`
- Output directory: `dist`
- Production branch: `main`
- Custom domain: `poetic-ping.ashterix.com`

Add the variables from `apps/web/.env.example` with production values. Preview deployments need redirect URLs registered in ZITADEL; use a stable custom preview hostname if possible.

## 5. Cloudflare Worker and Cron

Update the placeholder values in `apps/worker/wrangler.jsonc`, then add secrets without placing them in files:

```bash
cd apps/worker
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put RESEND_API_KEY
npx wrangler types worker-configuration.d.ts
npx wrangler deploy --dry-run
```

The checked-in schedule is every 15 minutes. Cloudflare Cron is UTC-only, so each sweep converts the instant into every user's IANA timezone. A 30-minute due window plus a unique database idempotency key protects against Cron drift and at-least-once execution.

When the dry run, test suite, and configuration values are correct, deploy the Worker. Then set `VITE_API_URL` on Pages to the Worker URL and deploy Pages.

## Security model

- ZITADEL is the sole user identity provider.
- The Worker is the only database client.
- The Worker derives `user_id` from the validated token subject; it never accepts a user ID from a request body.
- Supabase browser roles have no table or function grants.
- RLS is enabled on every public table as defense in depth.
- Delivery claims are atomic and repeat-safe.
- The last five successfully delivered poems are excluded where the collection is large enough; a small collection falls back gracefully rather than suppressing delivery forever.
