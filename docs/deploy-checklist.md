# Deploy checklist (Saturday)

Everything runs locally until now. These are the exact steps to put Onus live at onusmap.tech (the primary domain). onusbc.tech redirects to it and stays the sending domain for sign-in emails (Resend). Values live in the 1Password "Onus" vault and in your `.env.local`; this file lists names only.

## Before you start

- [ ] `git status` is clean and `npm run build` passes locally.
- [ ] Secrets check (done Oct 3): `.env.local` is gitignored and was never committed; a scan of the full git history found no keys, passwords, database URLs or service role keys. The only ElevenLabs value in the history is the public ID of the stock "Sarah" voice, in the PRD.

## 1. GitHub

- [ ] Create a new **private** repository on GitHub (for example `onus`). Don't add a README or .gitignore there; the repo has both.
- [ ] In the project folder: `git remote add origin <the repo URL>` then `git push -u origin main`. This pushes the full local history.
- [ ] On GitHub, confirm there is no `.env.local` in the file list.

## 2. Vercel

- [ ] Vercel: Add New, Project, import the GitHub repo. Framework preset: Next.js (defaults are fine; `prebuild` copies the map worker files).
- [ ] Add these environment variables (Production, and Preview if you want previews to work):

| Name | Notes |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (safe in the browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Used by judge login, account deletion and the Ask route. Never expose to the browser. |
| `GEMINI_API_KEY` | Ask answers and embeddings |
| `ELEVENLABS_API_KEY` | Voice routes |
| `ELEVENLABS_VOICE_ID` | The Sarah voice |
| `JUDGE_EVENT_CODE` | The judge access code for the event |
| `NEXT_PUBLIC_MAP_STYLE_LIGHT` | Optional; defaults to CARTO Positron |
| `NEXT_PUBLIC_MAP_STYLE_DARK` | Optional; defaults to CARTO Dark Matter |
| `NEXT_PUBLIC_SITE_URL` | `https://onusmap.tech` (the base for link previews; defaults to it if unset) |

  Not needed on Vercel: `SUPABASE_DB_URL` (local scripts only) and `DEMO_MODE` (demo mode is the `app_settings.demo_mode` row in the database, already on for the event).
- [ ] Deploy, then open the `*.vercel.app` URL and check the homepage and the map load.

## 3. Domains

- [ ] Vercel project, Settings, Domains: add `onusmap.tech` as the **primary** domain, and `www.onusmap.tech` redirecting to it.
- [ ] At the onusmap.tech registrar, set the DNS records Vercel shows (an A record for the apex, a CNAME for www). Wait until Vercel shows the domain as valid.
- [ ] Add `onusbc.tech` in Vercel as a domain that **redirects to onusmap.tech** (308).
  - A redirect only works once onusbc.tech's **web** record (the apex A record) points to Vercel. That's the only change to make there. Leave every **email** record for onusbc.tech exactly as it is (MX, SPF, DKIM, DMARC): Resend keeps sending sign-in codes from onusbc.tech.
  - If you'd rather not touch onusbc.tech's DNS at all, skip this redirect; sign-in email keeps working either way.

## 4. Supabase Auth

- [ ] Supabase dashboard, Authentication, URL Configuration: set **Site URL** to `https://onusmap.tech`.
- [ ] Add to **Redirect URLs**: `https://onusmap.tech/**`, `https://www.onusmap.tech/**`, `https://onusbc.tech/**`, `https://www.onusbc.tech/**`, and your Vercel URL `https://<project>.vercel.app/**`. Keep `http://localhost:3000/**` for local work.
- [ ] Confirm the "before user created" auth hook is still enabled (it limits sign-up to school email domains, except judge login).
- [ ] Resend: confirm onusbc.tech (the sending domain) shows as Verified, so sign-in codes arrive. No email changes are needed for onusmap.tech.

## 5. Checks on the live site

- [ ] Both basemaps load (light and dark), with the CARTO and OpenStreetMap attribution visible.
- [ ] `/privacy`, `/support`, `/sources`, `/how-it-works` open; every Get support link works.
- [ ] The map opens on On paper and a school's panel shows its quoted clauses.

## 6. Phone tests (on a real phone, on the live URL)

- [ ] Sign in with a real school email: the 6-digit code arrives and works.
- [ ] Judge access: any email plus the event code signs in.
- [ ] Rate a school, and watch that school's Onus count tick up and its dot pulse on a second device.
- [ ] Ask in text: the demo question ("If I report here, who finds out?") on UBC Vancouver gets a cited answer.
- [ ] Ask by voice: allow the microphone, ask, stop talking; it sends after a pause and Sarah reads the answer.
- [ ] The phone menu opens, closes, and every link works.

## 7. After it's live

- [ ] Record the backup demo video from the live site.
- [ ] Optional cleanup after the event: judge test ratings are stored with `is_demo = true`; sample rows with `source = 'sample'`.
