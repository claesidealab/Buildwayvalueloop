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
   | `BUILDWAY_EMAIL_DOMAINS` | `buildway.se` |

5. Deploy. Every push to the repository then updates the site automatically.

## Who can open it

`AUTH_DEV_LOGIN=true` shows the one-click example users on the login page, so anyone who has the link can get in as them. Only the example workspace exists, so that's fine for a review, but keep the link private, and turn on **Settings → Deployment Protection → Vercel Authentication** so only people in your Vercel team can open the site at all.

Before real customer data goes in:

1. Register the app with Microsoft and/or Google (see README, "Signing in") and add their keys plus `AUTH_URL` (the site's address).
2. Remove `AUTH_DEV_LOGIN`.

## Plans and cost

- Neon's free plan is enough for review and pilots.
- Vercel's free Hobby plan is for non-commercial use only; for Buildway's use, the Pro plan is the right one.
