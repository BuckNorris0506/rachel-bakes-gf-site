# Local development — Rachel Bakes GF admin

## Repo root

Use the directory that contains **`netlify.toml`** and **`public/`**:

```text
bucksites/
  netlify.toml          # publish = "public", API redirects
  netlify/functions/    # Netlify functions
  public/               # static site (includes rachel-bakes-gf/)
  .env                  # create from .env.example (gitignored)
```

## Run with Netlify Dev

From **`bucksites/`** (not `public/`):

```bash
cd bucksites
cp -n .env.example .env   # then edit ADMIN_PASSWORD at minimum
netlify dev
```

Watch the terminal for the URL (often **`http://localhost:8888`** if the port is free).

## Environment variables (local)

| Variable | Required for admin | Purpose |
|----------|-------------------|---------|
| **`ADMIN_SECRET`** | Yes | Must match `?secret=` in the URL **or** the default used on localhost (see `.env.example`). |
| **`ADMIN_PASSWORD`** | Yes | Entered in the admin “Unlock” form; sent as `x-admin-password`. |

Optional for live DB/email: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NOTIFICATION_FROM_EMAIL`, etc.

## Where to put them

1. Create **`bucksites/.env`** (same folder as `netlify.toml`).
2. Netlify CLI loads this file when you run **`netlify dev`**.
3. Alternatively use **`netlify env:set`** for a linked site (team workflows).

## Admin URL

With default dev port **8888**:

```text
http://localhost:8888/rachel-bakes-gf/admin/
```

With explicit secret (production-style):

```text
http://localhost:8888/rachel-bakes-gf/admin/?secret=local-dev-preview
```

Use the same string as **`ADMIN_SECRET`** in `.env`.

## Password field

Yes — you still **enter `ADMIN_PASSWORD`** after the page loads (unless it’s already in `sessionStorage` from a previous unlock). The query string only supplies the **secret** header, not the password.

## Localhost without `?secret=`

On **`localhost` / `127.0.0.1` / `[::1]`** only, the admin page sends a default `x-admin-secret` (`local-dev-preview`) so you can open `/admin/` with no query string. Set **`ADMIN_SECRET=local-dev-preview`** in `.env` so functions accept it.

Deployed production hostnames are **unchanged**: you must use **`?secret=<your production ADMIN_SECRET>`**.
