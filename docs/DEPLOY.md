# Deploying Value Loop

A review link needs two things: somewhere to run the app (Vercel) and a hosted Postgres (Neon, EU region). The embedded database used in development can't be used there, because Vercel has no permanent disk.

## 1. Database: Neon

1. Sign up at neon.tech (GitHub sign-in works).
2. Create a project. Region: **AWS Europe Central (Frankfurt)** or another EU region. Postgres 16 or 17.
3. Copy the **pooled** connection string (it contains `-pooler`). It looks like
   `postgresql://user:password@ep-xxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require`.

Tables are created automatically on the first request.

### Or: Supabase

Supabase is plain Postgres and works the same way:

1. Create a **new project** for Value Loop (EU region). Don't reuse a project that has its own tables: Value Loop creates `users`, `workspaces`, `sessions` and others in the `public` schema.
2. **Connect → Session pooler**: copy that connection string (host `aws-0-<region>.pooler.supabase.com`, port 5432). Don't use "Direct connection": it is IPv6-only and Vercel can't reach it.
3. Use it as `DATABASE_URL`. Value Loop only uses the database, not Supabase Auth or Storage.

## 2. App: Vercel

1. Sign up at vercel.com with GitHub.
2. **Add New → Project → Import** `claesidealab/Buildwayvalueloop`. Allow the Vercel GitHub app access to that repository.
3. Framework is detected as Next.js; keep the defaults.
4. Environment variables:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | the Neon pooled connection string |
   | `AUTH_DEV_LOGIN` | `true` for review only (see below) |
   | `AUTH_DEV_PASSWORD` | a password of your choice; required with `AUTH_DEV_LOGIN` on a hosted site |
   | `BUILDWAY_EMAIL_DOMAINS` | `buildway.se` |
   | `ANTHROPIC_API_KEY` | optional: turns on AI-assisted flow discovery |

5. Deploy. Every push to the repository then updates the site automatically.

### Or: Netlify

The repository includes `netlify.toml`, so Netlify needs no build settings.

1. app.netlify.com → **Add new project → Import an existing project → GitHub**, and allow Netlify access to `claesidealab/Buildwayvalueloop`.
2. Branch to deploy: `claude/ai-native-platform-planning-td4q73` (until there is a `main` branch).
3. Before deploying, add the same environment variables as above (`DATABASE_URL`, `AUTH_DEV_LOGIN`, `BUILDWAY_EMAIL_DOMAINS`).
4. Deploy. Every push to that branch updates the site.

To keep the review site private on Netlify, use **Project configuration → Access & security → Visitor access** (password protection), where your plan offers it.

## Who can open it

`AUTH_DEV_LOGIN=true` shows the example users on the login page. On a hosted site they also need the access password in `AUTH_DEV_PASSWORD`: without it, developer sign-in is refused. Share the password only with the people who should test. Only the example workspace exists, so that's fine for a review, but keep the link private, and turn on **Settings → Deployment Protection → Vercel Authentication** so only people in your Vercel team can open the site at all.

Before real customer data goes in:

1. Register the app with Microsoft and/or Google (see README, "Signing in") and add their keys plus `AUTH_URL` (the site's address).
2. Remove `AUTH_DEV_LOGIN`.

## Plans and cost

- Neon's free plan is enough for review and pilots.
- Vercel's free Hobby plan is for non-commercial use only; for Buildway's use, the Pro plan is the right one.
