# Deploying FieldSync

Everything runs on free plans:

- **Vercel** serves the web app and runs the API as one function under `/api`, from a single project.
- **Neon** holds the Postgres database, photos included.
- A **Vercel cron job** puts the demo back as it started, every night.

`node scripts/vercel-build.ts` builds both parts in Vercel's [Build Output](https://vercel.com/docs/build-output-api/v3) format; `vercel.json` tells Vercel to run it. CI runs the same build on every pull request.

## 1. The database, on Neon

1. Create a Neon project in the same region as the Vercel function (**Settings → Functions → Function Region** on Vercel). Every request crosses between the two, so being apart adds to each one. For users in Central Africa, Frankfurt for both is the closest.
2. In **Connect**, turn on **Connection pooling** and copy the connection string. The pooled one (its host contains `-pooler`) matters: every copy of the function opens its own connections.

Nothing else: the API creates its tables on its first request.

## 2. The app, on Vercel

1. **Add New → Project**, import the GitHub repository.
2. Leave **Root Directory** at the repository root and **Framework Preset** on **Other**. The build and install commands come from `vercel.json`.
3. Add these **Environment Variables** (Production):

| Name            | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`  | Neon's pooled connection string                                                     |
| `JWT_SECRET`    | 32 characters or more: `openssl rand -base64 32`                                    |
| `DEMO_PASSWORD` | The password of every demo user, 8 characters or more                               |
| `CRON_SECRET`   | 16 characters or more: `openssl rand -hex 16`. Vercel sends it with the nightly job |
| `TRUST_PROXY`   | `true`, so sign-in limits see each visitor's own address                            |
| `DB_POOL_MAX`   | `3`                                                                                 |

4. **Deploy.** Every push to `main` deploys again; pull requests get preview deployments.

## 3. Check it

- `https://<your-app>.vercel.app/api/healthz` answers `{"status":"ok"}`: the function runs.
- `https://<your-app>.vercel.app/api/readyz` answers `{"status":"ok"}`: it reaches the database. The first call also creates the tables and the demo org, so it can take a few seconds.
- Sign in as `dispatch@fieldsync.demo` with `DEMO_PASSWORD`.
- **Settings → Cron Jobs** lists `/api/demo/reset`, daily at 03:00 UTC. On the free plan it runs at some point within that hour.

## Good to know

- **No sleeping server.** Each request starts the function in about a second when it is not already warm. While someone has the app open, it syncs every 15 seconds, and it works offline in between anyway.
- **Free plan limits.** Requests up to 4.5 MB (photos are capped at 4 MB, and phones shrink them well below), 1 million function calls a month, one cron run a day. Going over pauses the project until the next month rather than billing.
- **Sign-in limits** are counted in the database (`rate_limits`), so every copy of the function shares them. The nightly reset clears the old counts.
- **Locally**, nothing changes: `pnpm --filter @fieldsync/api dev` and `pnpm --filter @fieldsync/web dev`, with the API's `.env` as in `apps/api/.env.example`.
