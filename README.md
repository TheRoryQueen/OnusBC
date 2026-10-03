# Onus

A live map that grades how BC's public colleges and universities handle sexual violence: what each school's policy promises, next to what students say happens.

Live at [onusmap.tech](https://onusmap.tech) (onusbc.tech redirects there).

Every school gets two grades on the same 0 to 4 scale. **On paper** is the school's published sexual violence policy, graded by AI against 17 criteria built from the Students for Consent Culture minimum standards, where every point must quote the policy word for word or it doesn't count. **In practice** comes from short, anonymous, multiple-choice ratings by people with a school email. **The gap** is the distance between the two.

## What's in it

- **Map:** every public post-secondary institution in BC (26, with UBC's two campuses counted separately), colored by grade or gap, with a school panel showing each category's score and the quoted clause behind it.
- **Ask about this policy:** ask in text or by voice; answers come only from that school's policy, with the section cited. Off-topic questions get a refusal with the school's own contact; crisis messages get the crisis response.
- **Rate your school:** sign in with a school email and a 6-digit code, answer a few multiple-choice questions, get a private edit code. Ratings are stored with no link to the account.
- **Get support:** 911, VictimLinkBC, and every school's support office on one page, linked from everywhere.
- **How it works, Privacy, Sources:** the method, the privacy policy, and a link for every number, quote and policy on the site.

## Stack

- Next.js 16 (App Router) with React 19, Tailwind CSS v4, shadcn/ui and Base UI, Motion, NumberFlow
- Supabase: Postgres with row level security, email-code auth, Realtime (the map updates live when a rating lands), pgvector for policy search
- MapLibre GL JS with CARTO basemaps (OpenStreetMap data)
- Google Gemini: policy grading (gemini-3.5-flash), answers (gemini-3.5-flash-lite, falling back to gemini-3.1-flash-lite), embeddings (gemini-embedding-001)
- ElevenLabs: speech to text (scribe_v1) and text to speech (eleven_flash_v2_5)
- Playwright for end-to-end tests

## Run it locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (Supabase project, Gemini and ElevenLabs keys, a judge event code). Never commit `.env.local`.
3. `npm run migrate` to apply the database migrations in `supabase/migrations`.
4. `npm run seed:institutions` to load `data/institutions.json`.
5. `npm run dev` and open http://localhost:3000.

The policy pipeline (`npm run crawl`, `extract`, `grade`, `verify`, `embed`) builds the On paper grades from each school's published policy; `npm run seed:demo` adds the sample ratings. `scripts/midnight.sh` runs the grading steps in one go when the free Gemini quota resets.

Tests: `npm run test:db`, `test:pipeline`, `test:map`, `test:auth`, `test:rate`, `test:ask-sheet`, `test:voice`, `test:nav`, `test:account`, `test:states`, `test:demo` (the browser tests need the dev server running). `npm run test:ask` and `test:voice` make real API calls.

## Data and sources

Every number, quote and policy on the site links to its source; the full list is on the Sources page (`/sources`).

- **Policies:** each school's own published sexual violence policy and procedures, found through the Province of BC's list.
- **National numbers:** Statistics Canada (Survey on Individual Safety in the Postsecondary Student Population 2019, General Social Survey 2019, Juristat clearance trends 2017 to 2022).
- **Public records:** numbers from schools' own annual reports (`data/public-records.json`, each with the report URL and the exact sentence).
- **Quotes:** four on-the-record quotes from published reporting, verbatim and unnamed (`data/quotes.json`).
- **Maps:** CARTO and OpenStreetMap contributors; BC's outline from Natural Earth (public domain).
- **Sample ratings:** In practice is mostly seeded sample data for now. Sample rows are stored as `source = 'sample'`, counted separately in every school's panel, and the map opens on On paper for that reason.

## A note on timing

Planning and early development of Onus started before StormHacks 2026, as the event rules allow. The git history starts on October 1, 2026.
