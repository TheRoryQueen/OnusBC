# Onus handoff

Read this at the start of every session, after CLAUDE.md and before docs/PRD.md. It records what is done, the
decisions made in the October 3, 2026 sessions that are not yet in CLAUDE.md or the PRD, and what is
unfinished or waiting on Farnaz. Nothing here has been pushed or deployed.

## Status of the last request

| Item | Status | Commit |
| --- | --- | --- |
| Northern emergency department rule | Done. CNC, UNBC, Coast Mountain and NLC lead with their nearest hospital emergency department (UHNBC, Ksyen Regional, Dawson Creek and District), with the Northern Health address, phone and ED status link, and the Province's line about going to a hospital after a sexual assault. | a67aea0 |
| Closer local services | Done. NIC: Comox Valley RCMP Victim Services leads, Comox Valley Family Services nearby. VIU: Nanaimo RCMP Victim Services leads. Selkirk: Nelson's 24/7 Anti-Violence Line leads. COTR: Summit (Cranbrook) leads. Okanagan College and UBC Okanagan: Connect Counselling nearby. Coast Mountain: Ksan's 24/7 sexual assault line and its victim services line. NLC: SPCRS Community Based Victim Services. | a67aea0, d906e4c |
| 24-hour and SAFE label checks | Done. "24 hours" only for VGH, Surrey Memorial and Abbotsford Regional. Island Health hospitals: "Forensic nurse examiners at the emergency department", from Island Health's current page (not the 2021 release), no 24-hour claim. Interior Health: "SAFE Program", each confirmed on the hospital's own page. | a67aea0 |
| Douglas / Cameray | Done. Douglas College (New Westminster) routes to Cameray, whose published area names New Westminster. | a67aea0 |
| Nelson source | Done. servicesfyi.ca is Nelson Community Services' own website, so it stays the source. | a67aea0 |
| Hospitals on the map | Done. 90 BC hospitals from DataBC "Hospitals in BC" (updated 2026-10-01), ink cross markers, popups with name, address, phone and the health authority ED status page, shown from zoom 7 or the three nearest a selected school. | 148efe8 |
| Here2Talk and counselling links | Done. Here2Talk confirmed on the Province's page (updated July 28, 2026), 1-877-857-3397. Every panel has Free counselling with Here2Talk and the school's own counselling page (26 of 26, each checked to load). | 97606d6 |
| In-app document viewer | Done. Any quote opens the exact graded copy, highlighted and scrolled into view (two-part highlight across a page break; quote shown above the page if it can't be highlighted). Web-page policies show the stored text. Lazy loaded, keyboard and screen reader accessible, COTR never served. | e9b7944, 2277aca |
| Read the policy button | Done. Under the On paper grade in every panel with a public policy, opening at page 1 with Policy and Procedures tabs. Sources has "View the graded copy" for 25 schools. | e9b7944 |

Earlier items:

| Item | Status | Commit |
| --- | --- | --- |
| Review clock | Done. 7 of 25 published policies are more than three years old (Camosun, Douglas, KPU, NIC, NLC, TRU, UNBC). The computed line is on the map and homepage. | 9b672ee |
| Multilingual Ask | Done. Answers in the question's language with citations in the policy's English; Farsi, French, Punjabi and Mandarin tested; cached Farsi demo answer for SFU. | 9f792bb |
| Ask timeout fix | Done. The backup model gets whatever is left of a 19.5 s budget; the route allows 30 s. | eb2c607 |
| onusmap.tech | Done in code (primary domain; onusbc.tech redirects and stays the Resend sender). DNS and the Vercel domain are still to do at deploy. | 93f1082 |

Also done this session: Ask can't mix schools (757416e), the simpler legend (5034dcb), accessibility audit at 0
findings (5d8e2a3), Listen to this report card (3beaba1), Devpost tracks (6a05d15), open data at /data (0a50d99),
and live Grade a policy for judges (61b4d50).

## Rules and decisions not yet in CLAUDE.md or the PRD

### Sexual assault support (data/support-centres.json, data/support-routes.json)
- Official sources only: the organization's own site, its health authority, or EVA BC's directory. Store every entry with name, address, phone, hours, who it serves, type and source URL.
- Never list or map a transition house, shelter or safe home, and never include an address that isn't publicly listed. The rule exists to protect confidential addresses, and a phone line reveals none, so an organization that also runs one may appear only as a phone line: no address, no map dot (Farnaz, Oct 3). This is how Ksan (Terrace), SPCRS (Dawson Creek) and Nelson Community Services appear. Their public offices are still never mapped. If only a phone number is public for any service, it is phone only.
- Wording: "sexual assault support", never "women's centre", in Onus's own copy.
- A campus is routed only to a program that serves its city; never to a centre whose published service area excludes the campus. A program whose published area names the campus's city comes before one with no stated area (this is why Douglas uses Cameray). Hospital sexual assault services serve everyone.
- Panel order: (1) campuses more than 100 km by road from any hospital sexual assault service lead with their nearest hospital emergency department, with the Province's line "Go to a hospital, a walk-in clinic, or your doctor for a medical examination and treatment as soon as possible after a sexual assault." and the ED status link; (2) local phone lines that cover the campus's city (Salal for Vancouver, the North Shore line for Capilano, RCMP victim services, Nelson's line for Selkirk, Summit for Cranbrook); (3) the nearest support by road, which is the purple line unless (1) applies; (4) other options nearby.
- Never label a hospital "24 hours" unless a current official page says the service itself is 24-hour.
- Routes are computed once with the public OSRM server, one request a second, and saved; the live site never calls a router. A distant centre (over 50 km and farther than the hospital) isn't routed. OSRM requests so far: 54 in the first build, 8 more for this request.
- The "campus farthest from 24-hour sexual assault care" stat is held, by Farnaz's decision, until Northern Health's care can be sourced. Do not show it.

### Map legend (lib/map-style.ts)
- No view toggle. Dot fill is the On paper grade, green (A) to red (F), with an ink outline; no public policy is a hollow dot; no letters on the map.
- A ring shows the gap only when a school has at least 5 real ratings (Onus ratings plus public records, never sample). Thickness shows the size; a ring touching the dot means worse than the policy, a ring with a space before it means better. Rings are ink (blue for better). No ring means not enough real ratings yet. Today only UBC Vancouver has a ring.
- Purple (#7032e0 light, #c084fc dark) means sexual assault support; ink crosses are hospitals. The route draws in like a directions app; with reduced motion it appears at once.

### Gemini and voice quotas
- gemini-3.5-flash (20 requests a day) is reserved for the nightly grading run (midnight.sh). Never spend it in tests or features.
- Ask: main gemini-3.5-flash-lite, backup gemini-3.1-flash-lite, embeddings gemini-embedding-001. Live Grade a policy uses gemini-3.5-flash-lite, one call per run, at most 10 runs a day and one at a time.
- Keep lite-model and ElevenLabs calls minimal in tests: offline checks by default, live checks behind --live.
- Text to speech uses eleven_flash_v2_5 where it covers the language and eleven_v3 for Farsi and Punjabi, always the Sarah voice. Report card audio is cached per school.

### Security fixes (the "check" commit, baf9130, and since)
- Sign-in redirects only to same-origin paths (lib/safe-next.ts rejects //, backslashes and control characters).
- Client IP from x-real-ip first (lib/client-ip.ts), used by every rate limit.
- edit_rating is server only; rating timestamps are rounded to the week; the ratings PATCH uses the admin client.
- Judge login: 10 attempts per IP per 10 minutes, plus 200 wrong codes per 10 minutes across everyone; null-body guards on judge login and Ask.
- Security headers on every response (next.config.ts). A Content-Security-Policy is still a follow-up.
- Grade a policy: judges and admins only (ONUS_ADMIN_EMAILS, server only); pasted links must be https, private and internal addresses are refused at every redirect, 15 MB cap, must be a PDF.
- The document viewer never serves COTR's login-only policy; documents are served only from the stored, graded copies.
- Never print a key: load env values through Node, not by sourcing .env.local in the shell (an earlier attempt printed the ElevenLabs key in an error).

### Other conventions from this session
- One commit per item with a clear message; commits use the name Farnaz Abdolmaleki.
- MapLibre and PDF.js workers are copied to public/ at predev and prebuild (scripts/copy-maplibre-worker.mjs), not committed.
- The 44 px tap-target rule is met with the `hit` utility for standalone controls and real 44 px rows for stacked lists; links inside text are underlined, not colour-only.
- Review clock wording: "published policy last revised"; never say a school broke the law.

## Flagged for Farnaz
- Rotate the ElevenLabs API key: it was printed in a shell error on October 3 (not in any file or commit).
- Add ONUS_ADMIN_EMAILS in Vercel at deploy; set up DNS for onusmap.tech and the onusbc.tech redirect.
- Resolved: Nelson's line stays, and Ksan and SPCRS now appear as phone lines (rule above). Haven, Tillicum Lelum and CDCSS (outside the north) are still left out entirely; apply the phone-only rule to them too if wanted.
- The Terrace and Dawson Creek RCMP pages publish no victim services number, so no RCMP line is listed there.
- Nelson's line has no published service area; it is shown for Castlegar (Selkirk) as the nearest campus, about 40 km from Nelson.
- Summit (Cranbrook) has no exact map position in OpenStreetMap, so it shows by phone and address but not as a dot.
- Connect Counselling (Kelowna) is included from EVA BC's Stopping the Violence listing; its own site describes trauma and abuse counselling without naming sexual assault.
- SFU's stored policy text begins with the SFU site's navigation menu (and "north_east" icon labels), kept by the extractor. It is the exact text that was graded; cleaning it would mean re-extracting and re-verifying.
- Interior Health's SAFE care can involve a teleSAFE consult or a transfer, per its program page; Onus says "SAFE Program", not that an examiner is on site.
- The farthest-campus stat is on hold (above).

## Test results at handoff (October 3, 2026)
All 24 suites were run. 23 pass in full:
theme (all passed), db 91, pipeline 113, map 39, auth 20, rate 26, ask-sheet 27, voice 22, nav 14, account 11,
states 13, crisis 30, fixes 22, review-dates 100, multilingual 6, grade 17, ask-isolation 8, support 49,
a11y 0 findings, report-card 207, data 14, viewer 28, demo 18.

test:ask: 25 of 28. The three failures are the backup Ask model (gemini-3.1-flash-lite) not answering within its
19 s budget when the main model is forced to fail; the chain still falls back to the cached answer or the
refusal with the school's contact. It answered in 12 to 15 s on October 3 with the same budget, so it is most
likely the model being slow that day. Rerun test:ask (about 15 live calls); if it still fails, give the backup a
faster model or a shorter prompt.
