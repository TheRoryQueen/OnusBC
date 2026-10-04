# Onus

A live map that grades how BC's public colleges and universities handle sexual violence: what each school's policy promises, next to what students say happens.

Live at [onusmap.tech](https://onusmap.tech) (onusbc.tech redirects there).

Every school gets two grades, each scored 0 to 100 with a letter (A 80+, B 70+, C 60+, D 50+, F below 50). **On paper** is the school's published sexual violence policy, graded by AI against 17 criteria built from the Students for Consent Culture minimum standards under a strict rubric: a point counts only when the policy commits to it in writing, and every point must quote the policy word for word or it doesn't count. If it isn't written down, students can't rely on it. **In practice** comes from short, anonymous, multiple-choice ratings by people with a school email. **The gap** is the distance between the two.

## What's in it

- **Map:** every public post-secondary institution in BC (26, with UBC's two campuses counted separately) and their other campuses, coloured green to red by policy document grade, with a gap ring (green to red) wherever at least five real ratings show one. Zoomed out, overlapping schools merge into one dot coloured by their average score. Purple dots are sexual assault support, with a route drawn from the selected campus to the nearest one; crosses are BC's hospitals (one cross per hospital). The legend is a card that slides up and folds away.
- **School panel:** each category's score and the quoted clause behind it, the school's rank in BC, a review clock (when the published policy was last revised and when BC law requires the next review), what to raise at that review, and the nearest support, counselling and hospital for that campus.
- **Read the policy:** every quote opens the exact graded copy of the policy, highlighted and scrolled into view.
- **Ask about this policy:** ask in text or by voice, in any language; answers come only from that school's policy, with the section cited. Off-topic questions get a refusal with the school's own contact; crisis messages get the crisis response.
- **Listen:** each school's report card read aloud.
- **Rate your school:** sign in with a school email and a 6-digit code, answer a few multiple-choice questions, get a private edit code. Ratings are stored with no link to the account.
- **Get support:** 911, VictimLinkBC, Here2Talk, and each campus's nearest sexual assault support, hospital and counselling, linked from every page.
- **Grade a policy:** judges can paste a policy PDF link and watch it graded live against the same rubric.
- **How it works, Privacy, Sources, Open data:** the method, the privacy policy, a link for every number, quote and policy on the site, and the grades as downloadable files.

## Stack

- Next.js 16 (App Router) with React 19, Tailwind CSS v4, shadcn/ui and Base UI, Motion, NumberFlow
- Supabase: Postgres with row level security, email-code auth, Realtime (the map updates live when a rating lands), pgvector for policy search
- MapLibre GL JS with CARTO basemaps (OpenStreetMap data), routes precomputed with OSRM
- PDF.js for the in-app policy viewer
- Google Gemini: policy grading (gemini-3.5-flash), answers and live grading (gemini-3.5-flash-lite, falling back to gemini-3.1-flash-lite), embeddings (gemini-embedding-001)
- ElevenLabs: speech to text (scribe_v1) and text to speech (eleven_flash_v2_5, and eleven_v3 for Farsi and Punjabi)
- Playwright for end-to-end and accessibility tests

## Run it locally

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the values (Supabase project, Gemini and ElevenLabs keys, a judge event code). Never commit `.env.local`.
3. `npm run migrate` to apply the database migrations in `supabase/migrations`.
4. `npm run seed:institutions` to load `data/institutions.json`.
5. `npm run dev` and open http://localhost:3000.

The policy pipeline (`npm run crawl`, `extract`, `grade`, `verify`, `embed`) builds the On paper grades from each school's published policy; `npm run review-dates`, `support-routes` and `hospital-routes` build the review clock and the routes; `npm run seed:demo` adds the sample ratings. `scripts/midnight.sh` runs the grading steps in one go when the free Gemini quota resets.

Tests: `npm run test:db`, `test:pipeline`, `test:map`, `test:auth`, `test:rate`, `test:ask-sheet`, `test:ask-isolation`, `test:voice`, `test:nav`, `test:account`, `test:states`, `test:demo`, `test:crisis`, `test:support`, `test:viewer`, `test:report-card`, `test:review-dates`, `test:grade`, `test:data`, `test:a11y` (the browser tests need the dev server running). `npm run test:ask`, `test:voice` and `test:multilingual` make real API calls.

## Data and sources

Every number, quote and policy on the site links to its source; the full list is on the Sources page (`/sources`).

- **Policies:** each school's own published sexual violence policy and procedures, found through the Province of BC's list.
- **National numbers:** Statistics Canada (Survey on Individual Safety in the Postsecondary Student Population 2019, General Social Survey 2019, Juristat clearance trends 2017 to 2022).
- **Public records:** numbers from schools' own annual reports (`data/public-records.json`, each with the report URL and the exact sentence).
- **Support and hospitals:** official sources only (the organization's own site, its health authority, or EVA BC's directory) in `data/support-centres.json`; hospitals from DataBC's Hospitals in BC; Here2Talk from the Province of BC. Transition houses, shelters and safe homes are never mapped.
- **Quotes:** on-the-record quotes from published reporting, verbatim and unnamed (`data/quotes.json`); the homepage shows three.
- **Maps:** CARTO and OpenStreetMap contributors; BC's outline from Natural Earth (public domain).
- **Sample ratings:** In practice is mostly seeded sample data for now. Sample rows are stored as `source = 'sample'`, counted separately in every school's panel, and never count toward a gap ring.

## A note on timing

Planning and early development of Onus started before StormHacks 2026, as the event rules allow. The git history starts on October 3, 2026.
