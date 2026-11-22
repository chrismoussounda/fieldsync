# Deploying FieldSync

Everything runs on free plans:

- **Vercel** serves the web app and runs the API as one function under `/api`, from a single project.
- **Neon** holds the Postgres database, photos included.
- A **Vercel cron job** puts the demo back as it started, every night.

`node scripts/vercel-build.ts` builds both parts in Vercel's [Build Output](https://vercel.com/docs/build-output-api/v3) format; `vercel.json` tells Vercel to run it. CI runs the same build on every pull request.

## 1. The project, on Vercel

1. **Add New → Project**, import the GitHub repository, or run `npx vercel link` at its root.
2. Leave **Root Directory** at the repository root and **Framework Preset** on **Other**. The build and install commands, and the Frankfurt region (`fra1`), come from `vercel.json`.

## 2. The database, Neon through Vercel

**Storage → Create Database → Neon**, on the free plan, in Frankfurt like the function: every request crosses between the two. Or from the command line:

```sh
npx vercel integration add neon --meta region=fra1 --billing-plan free_v3 --name fieldsync-db
```

Vercel connects it to the project and adds `DATABASE_URL`, the pooled connection that every copy of the function can share. The API creates its tables on its first request.

## 3. The settings

Add these to Production and Preview (**Settings → Environment Variables**, or `npx vercel env add NAME production`):

| Name            | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| `JWT_SECRET`    | 32 characters or more: `openssl rand -base64 48`. Mark it sensitive                                    |
| `CRON_SECRET`   | 16 characters or more: `openssl rand -hex 24`. Vercel sends it with the nightly job. Mark it sensitive |
| `DEMO_PASSWORD` | The password of every demo user, 8 characters or more                                                  |
| `TRUST_PROXY`   | `true`, so sign-in limits see each visitor's own address                                               |
| `DB_POOL_MAX`   | `3`                                                                                                    |

Every push to `main` then deploys to production; other branches get preview deployments.

## 4. Check it

- `https://<your-app>.vercel.app/api/healthz` answers `{"status":"ok"}`: the function runs.
- `https://<your-app>.vercel.app/api/readyz` answers `{"status":"ok"}`: it reaches the database. The first call also creates the tables and the demo org, so it can take a few seconds.
- Sign in as `dispatch@fieldsync.demo` with `DEMO_PASSWORD`.
- **Settings → Cron Jobs** lists `/api/demo/reset`, daily at 03:00 UTC. On the free plan it runs at some point within that hour.

## Good to know

- **No sleeping server.** Each request starts the function in about a second when it is not already warm. While someone has the app open, it syncs every 15 seconds, and it works offline in between anyway.
- **Free plan limits.** Requests up to 4.5 MB (photos are capped at 4 MB, and phones shrink them well below), 1 million function calls a month, one cron run a day. Going over pauses the project until the next month rather than billing.
- **Sign-in limits** are counted in the database (`rate_limits`), so every copy of the function shares them. The nightly reset clears the old counts.
- **Locally**, nothing changes: `pnpm --filter @fieldsync/api dev` and `pnpm --filter @fieldsync/web dev`, with the API's `.env` as in `apps/api/.env.example`.
