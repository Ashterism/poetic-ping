# Poetic Ping

A small, multi-user app for birthday reminders and a weekly poem. It uses:

- Cloudflare Pages for the React frontend
- Cloudflare Workers for the authenticated API and scheduled delivery sweep
- Supabase Postgres for application data and delivery history
- ZITADEL OIDC (Authorization Code + PKCE) for sign-in

The browser never connects to Supabase directly. It signs in with ZITADEL and sends the access token to the Worker. The Worker validates the token against ZITADEL's rotating JWKS, scopes every database request to the token subject, and keeps the Supabase service key secret.

## Local setup

Requirements: Node.js 22+, npm 10+, a ZITADEL User Agent application, and the Supabase project.

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
npm run dev:web
```

Run the Worker in a second terminal:

```bash
npm run dev:worker
```

Configure the ZITADEL application as a browser/User Agent app using Authorization Code with PKCE. Register `http://localhost:5173/auth/callback` as a redirect URI and `http://localhost:5173` as a post-logout URI. Configure access tokens as JWTs and include the Worker API audience in the token.

The frontend settings belong in `apps/web/.env.local`. Worker secrets belong in `apps/worker/.dev.vars` locally and must be added with `wrangler secret put` in Cloudflare. Do not commit either file.

## Database

The committed migration is in `supabase/migrations`. It creates profiles, birthdays, poems, tags, weekly preferences, and idempotent delivery history. All tables have RLS enabled; browser roles receive no access. Only the server-side `service_role` can use the Data API.

The production project is `poetic-ping` in Supabase organisation `Ashterism`, region `eu-west-2`.

## Cloudflare configuration

Nothing in this repository deploys automatically.

Pages settings:

- Root directory: `apps/web`
- Build command: `npm ci && npm run build`
- Build output: `dist`
- Environment variables: the four `VITE_*` values from `apps/web/.env.example`

Worker setup:

```bash
cd apps/worker
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler deploy --dry-run
```

Add the non-secret values in `apps/worker/wrangler.jsonc`, then set a Supabase `sb_secret_...` key as the Worker secret. The Cron runs every 15 minutes in UTC; the code converts each user's configured IANA timezone before deciding whether their local delivery time is due. Add a Resend key and verified sender to deliver email. Without those values, the Worker records a clear delivery failure rather than pretending an email was sent.

See [docs/setup.md](docs/setup.md) for the remaining ZITADEL and Cloudflare dashboard steps.
