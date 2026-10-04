# Deploy guide (October 4, 2026)

Click by click. You make every dashboard change and paste every key yourself; nothing here contains a key
value. Do the parts in order. Where a dashboard shows its own value (a DNS target, an IP address), use the
value the dashboard shows, not the example here.

## Environment variables (names only)

From `.env.local`:

| Name | Vercel (Production) | Notes |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Yes | Public |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Yes | Public |
| SUPABASE_SERVICE_ROLE_KEY | Yes | Server only. Never in a NEXT_PUBLIC_ name |
| GEMINI_API_KEY | Yes | Server only |
| ELEVENLABS_API_KEY | Yes | Server only. Paste the new, rotated key (the old one was printed in a shell error on Oct 3) |
| ELEVENLABS_VOICE_ID | Yes | Server only |
| JUDGE_EVENT_CODE | Yes | Server only |
| ONUS_ADMIN_EMAILS | Yes | Server only. Comma-separated emails allowed to use Grade a policy besides judges |
| NEXT_PUBLIC_SITE_URL | Yes | Set to `https://onusmap.tech` in Vercel (not the localhost value) |
| NEXT_PUBLIC_MAP_STYLE_LIGHT | Optional | The code falls back to the CARTO Positron style if unset |
| NEXT_PUBLIC_MAP_STYLE_DARK | Optional | The code falls back to the CARTO Dark Matter style if unset |
| SUPABASE_DB_URL | No, local only | Used only by the migration and pipeline scripts |
| DEMO_MODE | No, local only | The live demo mode is a database setting (app_settings.demo_mode), not this variable |

## 1. Vercel: import and deploy

1. Go to vercel.com and sign in with GitHub (the TheRoryQueen account that owns the repo).
2. Click **Add New...** (top right), then **Project**.
3. Under **Import Git Repository**, find **OnusBC** and click **Import**. If it isn't listed, click
   **Adjust GitHub App Permissions**, give Vercel access to the OnusBC repo, then come back.
4. On **Configure Project**: Framework Preset shows **Next.js** (leave it). Root Directory: leave as `./`.
   Build and Output Settings: leave the defaults (`npm run build`; the prebuild step copies the map and PDF
   workers).
5. Open **Environment Variables**. For each name marked Yes above: type the name, paste the value from your
   1Password Onus vault, leave the environment as **Production** (also tick **Preview** if you want preview
   deploys to work), click **Add**. Set NEXT_PUBLIC_SITE_URL to `https://onusmap.tech`.
6. Click **Deploy**. Wait for the build to finish (about 2 to 4 minutes). It should end on a
   "Congratulations" screen with a `*.vercel.app` URL. Copy that URL; it's needed in part 4.

## 2. Vercel: domains

1. In the project, open **Settings**, then **Domains**.
2. Type `onusmap.tech`, click **Add**. When Vercel asks, choose the option that also adds `www.onusmap.tech`
   and **redirects www.onusmap.tech to onusmap.tech**. onusmap.tech is the primary domain.
3. Type `onusbc.tech`, click **Add**. Choose **Redirect to Another Domain**, target `onusmap.tech`,
   status **308 Permanent**.
4. Type `www.onusbc.tech`, click **Add**, and set it the same way: redirect to `onusmap.tech`, 308.
5. Each domain now shows **Invalid Configuration** with the DNS records it wants. Keep this page open; part
   3 enters those records. Write down exactly what Vercel shows for each (record type, name, value).
   Typically: `A` record, name `@`, value `76.76.21.21` for an apex domain, and `CNAME` record, name `www`,
   value `cname.vercel-dns.com`. Vercel may show newer project-specific values; use those if so.

## 3. DNS at get.tech (Namify)

Both domains are registered with Namify (get.tech's registrar) and use its DNS (orderbox-dns.com), so both
are edited in the same place: sign in at get.tech, open **My Domains**, choose the domain, then
**Manage DNS** (or **DNS Management**).

### onusmap.tech

1. Delete the two placeholder records that point at `127.0.0.1`: the `A` record for `@` (onusmap.tech) and
   the `A` record for `www`. (They are parking placeholders; the site can't load while they exist.)
2. Add an **A** record: host `@` (or blank), value: the IP Vercel showed for onusmap.tech, TTL lowest offered.
3. Add a **CNAME** record: host `www`, value: the target Vercel showed (for example `cname.vercel-dns.com`).
4. Save. Back in Vercel's Domains page, onusmap.tech and www.onusmap.tech turn **Valid** within minutes (up
   to an hour). Vercel issues the HTTPS certificate on its own.

### onusbc.tech (website records only)

First confirm these existing email records are present and **do not edit or delete them**. They are what
lets Resend send the sign-in codes from no-reply@onusbc.tech. As seen in public DNS on Oct 4, 2026:

| Host | Type | Value (as published) | Purpose |
| --- | --- | --- | --- |
| send.onusbc.tech | CNAME | send.forge.rmta.net | Resend sending domain (its MX `10 feedback.forge.rmta.net` and SPF TXT `v=spf1 ip4:52.3.252.119 ip4:44.222.39.36 ip4:199.249.231.0/24 ~all` come through it) |
| resend._domainkey.onusbc.tech | TXT | `p=MIGfMA0GCSq...` (Resend's DKIM public key) | Resend DKIM signature |
| _dmarc.onusbc.tech | TXT | `v=DMARC1; p=none;` | DMARC policy |

Then add only the website records:

1. Add an **A** record: host `@`, value: the IP Vercel showed for onusbc.tech.
2. Add a **CNAME** record: host `www`, value: the target Vercel showed for www.onusbc.tech.
3. Save. Do not touch `send`, `resend._domainkey` or `_dmarc`. onusbc.tech has no website records today,
   so nothing else needs removing.

## 4. Supabase Auth URLs

1. Open supabase.com, the Onus project, **Authentication**, then **URL Configuration**.
2. **Site URL**: `https://onusmap.tech`. Click **Save**.
3. Under **Redirect URLs**, click **Add URL** for each and save:
   - `https://onusmap.tech/**`
   - `https://onusbc.tech/**`
   - the Vercel URL from part 1, with `/**` on the end (for example `https://onus-bc.vercel.app/**`)
   - optional, for preview deploys: `https://*-<your-vercel-team>.vercel.app/**`
4. Sign-in uses a 6-digit code, not a link, so these mostly matter for the email template's fallback link and
   for future link-based flows; set them anyway.

## 5. API keys with domain or referrer restrictions

- **Google AI Studio (GEMINI_API_KEY)**: the key is used only from the server (Vercel functions and local
  scripts), which send no browser referrer. Open aistudio.google.com, **Get API key**, the key's **...**
  menu: its restrictions must be **None** (or API restrictions only). Do not add an HTTP referrer or website
  restriction: that would block the server's calls. Nothing to add for the two domains.
- **ElevenLabs (ELEVENLABS_API_KEY)**: ElevenLabs keys have permission scopes, not domain restrictions. The
  new key needs Text to Speech and Speech to Text enabled. Nothing to add for the domains.
- **MapLibre and CARTO**: no account and no key. Nothing to do.
- **Supabase anon key**: no domain restriction; access is controlled by row level security.

## 6. Resend

No change is needed. Supabase sends the codes through Resend's SMTP from `no-reply@onusbc.tech`, and that
depends only on the three email records above, which stay. After the deploy, part of the smoke test is a
real sign-in code arriving from no-reply@onusbc.tech. If you want to look: resend.com, **Domains**,
onusbc.tech should still read **Verified**.

## 7. Tell me it's live

Say "it's live" and I'll smoke-test https://onusmap.tech on phone and desktop, in both themes: homepage,
map, a school panel, the document viewer, Ask (one call), Listen, a sign-in email, a rating, /data, and the
onusbc.tech redirect, and report pass or fail for each.
