# Onus: Devpost draft

## Inspiration

BC law requires every public college and university to have a sexual violence policy and to review it regularly. Nobody outside the schools checks whether those policies work. Schools grade students every semester; nobody grades the schools.

The national numbers show why that matters. Only 8% of women students who were sexually assaulted in a postsecondary setting told anyone at their school (Statistics Canada, 2019). Only 6% of sexual assaults in Canada are reported to police. And 19% of women students who didn't report said they didn't think their school would take it seriously.

No Canadian dataset tracks, school by school, how reports are handled. So we built one.

## What it does

Onus ([onusmap.tech](https://onusmap.tech)) is a live map of every public college and university in BC, 26 campuses in all. Each school gets two grades on the same 0 to 4 scale:

- **On paper:** the school's own published policy, graded by AI against 17 criteria built from the Students for Consent Culture minimum standards. Every point has to quote the policy word for word, or it doesn't count.
- **In practice:** short, anonymous, multiple-choice ratings from people with that school's email address.
- **The gap** is the distance between the two.

Tap a school to see each category's score and the exact clause behind it. Ask the policy a question in text or out loud ("If I report here, who finds out?") and get an answer drawn only from that school's policy, with the section cited. Sign in with a school email and rate your school; the map updates live for everyone watching. Every page links to Get support, with 911, VictimLinkBC and every school's support office.

More in every school's panel:

- **The review clock.** BC's Sexual Violence and Misconduct Policy Act requires each school to review its policy at least every 3 years. Onus reads the date printed in each published policy, shows the exact line it came from, and counts down to the next review. Today 7 of 25 published policies are more than three years old. Onus says "published policy last revised" and never claims a school broke the law, since a school may have reviewed without republishing.
- **Ask in your own language.** Questions in Farsi, French, Punjabi, Mandarin and more are answered in that language, while every citation stays the policy's exact English. Voice detects the language too.
- **Nearest sexual assault support.** Purple dots mark 14 hospitals with published 24-hour sexual assault or forensic nurse care and the community sexual assault support programs with public addresses, all from official sources. Selecting a school draws the road route to the nearest one that serves its city, with call, website and Google Maps directions.
- **Listen to this report card.** A spoken summary of the grade, the strongest and weakest category, the review clock and where to get help, built only from stored data.
- **Grade a policy, live.** Judges can watch Onus grade a real policy from outside BC with the same quote check, streamed criterion by criterion. A live run of McMaster University's policy scored a B (2.47 of 4) in 6 seconds, with 13 quotes verified and 3 rejected.

## How we built it

- **The grading pipeline:** a crawler finds each school's policy (and separate procedures, where a school publishes them) from the Province's list; an extractor turns PDFs and web pages into clean text; Gemini grades the 17 criteria; and a verifier checks every quote against the policy text. Of 312 quotes checked, 311 were found word for word and 1 was rejected (the AI wrote "Gender-Based" where the policy says "Gender based"). Zero unverified quotes are stored. 25 schools are graded; one school's policy sits behind a staff login, so it shows as "No public policy" with that note.
- **Ask:** the policies are split into 967 passages and embedded; each question pulls the closest passages and Gemini answers only from them. Code rejects any answer whose quotes aren't in the retrieved text, and falls back from the main model to a lighter one, then to a verified cached answer, then to a refusal with the school's contact. Voice uses ElevenLabs speech to text and text to speech, through the same pipeline.
- **The app:** Next.js 16, Tailwind v4, Supabase (Postgres with row level security, email-code sign-in, Realtime), MapLibre with CARTO basemaps.
- **Privacy by design:** the ratings table has no user ID column at all. Ratings are written only through database functions, dates are rounded to the week, a school's results appear only after 5 ratings, and edit codes are stored as hashes. There are no free-text fields in the questionnaire, so no names or stories can be stored.
- **Honest data:** every number on the site links to its source. In practice is mostly seeded sample data for now, labelled "sample" and counted separately in every panel, so the map shades each dot by its On paper grade and only draws the gap ring once a school has 5 real ratings (Onus ratings or public records, never sample). Sample ratings sit on the same neutral baseline for every school, and only real numbers from a school's own annual report can move it (we found official numbers for 6 schools).

## Challenges we ran into

- **Free-tier limits.** The grading model allows 20 requests a day, so grading ran across two nights through a single script, and the embedding quota capped how fast we could index policies.
- **PDFs fight back.** False quote rejections traced back to extraction: a page footer landing mid-sentence, a broken "ti" ligature, and hyphenated line breaks. Each needed its own fix before the quote check could be trusted.
- **Being fair with fake data.** Our first sample-ratings rule could produce extreme results by chance. We replaced it with a neutral baseline that only real public records can move.
- **Speed.** On a phone-on-4G profile, the map's school dots took 2.26 s to appear. Drawing them in the server-rendered HTML and loading the map engine afterwards brought that to 0.50 s, at first paint.
- **Voice on phones.** iPhone Safari blocks audio that isn't started by a tap, so Sarah's answer plays through an audio context unlocked by the mic tap, with a Listen button as backup.

## Accomplishments that we're proud of

- Every graded point is backed by a quote that a script checked word for word.
- The first school-by-school comparison of BC sexual violence policies we know of. No school earns an A on paper; the highest grade is a B (both UBC campuses, 2.83 of 4) and the lowest a C (1.46 of 4).
- Real public-record numbers from schools' own annual reports, each linked, including UBC's Investigations Office report, checked against press coverage.
- A full end-to-end browser test of the demo, from the homepage through a live rating, at phone and desktop size.

## What we learned

- Policy language is where accountability hides: "may" and "will" are worth very different points, and the quote check makes that visible.
- Making the AI quote its evidence, and checking it in code, is what made the grades trustworthy.
- Honesty about data is a design problem: labelling sample data clearly mattered as much as building the map.

## What's next for Onus

- Real ratings from students, staff and alumni, so In practice no longer depends on sample data.
- Hand-grading three schools to measure how often the AI agrees with a person.
- Every province, then private colleges.
- An audit tool that helps institutions see exactly which criteria their policy misses.

## Tracks

**Surge Choice.** Onus turns a law nobody checks into something anyone can see: every public college and university in BC, graded on its own words, with every point backed by a quote that code verified, and a clock showing which published policies are past their three-year review.

**Best Solo.** Onus was designed, built and tested by one person: the crawler, extractor, grader and quote verifier, the database and its privacy rules, the map, Ask in text and voice, and 21 automated test suites, most of which run the real app in a browser.

**IATSU Best Design.** One map with one legend: dots run green to red by grade, a ring appears only where real ratings show a gap, and purple always means sexual assault support. It works at phone width and in light and dark mode, and an automated WCAG 2.1 AA audit of every page reports zero issues.

**MLH Best Use of ElevenLabs.** Ask works out loud: ElevenLabs speech to text detects the language, the answer comes back in the Sarah voice (Flash v2.5, or Eleven v3 for Farsi and Punjabi), and every school's report card can be heard, generated once and cached.

**MLH Best Use of Gemini.** Gemini grades 17 criteria per policy with structured output and answers questions from retrieved passages with gemini-embedding-001. Code checks every quote: of 312 grading quotes, 311 were found word for word, and Ask refuses any answer it can't cite.

**MLH Best .Tech Domain.** Onus lives at onusmap.tech, a short name that says what it is: a map that puts the onus on schools.

**Enactus UN Sustainable Development Goals.**
- Goal 4, Quality Education: students can see whether their school's policy protects them before they need it, in their own language.
- Goal 5, Gender Equality: sexual violence falls hardest on women and gender-diverse students, and Onus makes each school's response comparable and public.
- Goal 16, Peace, Justice and Strong Institutions: the review clock shows when each school's published policy is past BC's three-year review, holding institutions to their own law.
- Goal 17, Partnerships for the Goals: every number links to its public source, and the open data page lets students, researchers and advocates download every grade, quote and review date to build on, free with credit.

**WiCS Cosmos.** Onus maps something usually kept out of sight, with the care it needs: no free-text fields, no names, ratings with no link to an account, and help one tap away on every screen.

## Built with

Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Base UI, Motion, NumberFlow, Supabase (Postgres, Auth, Realtime, pgvector), MapLibre GL JS, CARTO, OpenStreetMap, OSRM, Nominatim, Natural Earth, Google Gemini, ElevenLabs, pdf.js, Playwright, axe-core, Vercel.
