# Sivilization

A React + Vite app using Supabase Auth and database-backed film, game, product, and saved-film catalogs.

## Requirements

- Node.js and npm
- A Supabase project
- The Supabase schema and row-level security setup for this app

## Configure Supabase

Create `.env.local` in the project root:

```dotenv
VITE_SUPABASE_URL=[https://YOUR_PROJECT_REF.supabase.co](https://YOUR_PROJECT_REF.supabase.co)
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use your Supabase Project URL and publishable/anon key. Never put a service-role key in a `VITE_` variable. Vite exposes `VITE_` variables to browser code.

Restart the dev server after changing environment variables.

## Install and run

```bash
npm install
npm run dev
```

## Check the production build

```bash
npm run build
npm run preview
```

## Supabase tables used by the current UI

- `profiles`: account email and administrator flag.
- `films`: published film metadata.
- `saved_films`: films saved by the signed-in user.
- `games`: published game catalog.
- `products`: published product catalog.

The browser app expects Supabase row-level security to protect private rows and administrator writes. A role check in React is for display only; it is not an authorization boundary.

## Current limitations

- Shop and games are catalog views; checkout and purchase records are not implemented.
- Paid playback and rental/subscription entitlements are not implemented.
- Do not use a client-side button or update to mark an order or subscription as paid.
- Private video playback requires server-side entitlement checks and short-lived signed URLs.
- The terms/privacy page is a starter template and must be updated to describe actual data practices before launch.