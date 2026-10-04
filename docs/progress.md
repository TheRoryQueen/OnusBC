# Progress log (October 3, 2026 request)

This file always shows where the work is, in case the session stops. Items run in order; each is committed
with this file updated. Item 7 is the one called "item 6" in the request (the stricter grading).

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 1 | Haven, Tillicum Lelum and CDCSS as phone-only lines; handoff | Done | 44e0403 |
| 2 | Map: hover cards, filter, search, legend, hospital routes, campuses | Done | e02cdca, 674057b, 196c7c5 |
| 3 | School panel: Call, Listen, Read the summary | Done | 561459a |
| 4 | Nav: same destinations, footer links, phone menu bug, tabs | Done | f83ffa7 |
| 5 | Rating flow and account | Done | see git log (item 5) |
| 6 | Design pass: Get support and How it works | Not started | |
| 7 | Stricter grading (stops after the rubric for approval) | Not started | |

## 1. Phone-only lines

Done before this log was started, in 44e0403. Checked again: Haven Society Community Victim Services
(1-888-756-0616), Tillicum Lelum Community-Based Victim Services (250-753-6000) and CDCSS Community-Based
Victim Services (250-365-2104) are type phone_only with address null and no coordinates, so they have no map
dot, the same as Ksan and SPCRS. docs/handoff.md already states the rule and lists all five.

## 2. Map

Part 1 done (commit: see git log, "Map: school search, docked legend"):
- Hover card: name and On paper grade only. It is measured and placed above the dot, or below, right or
  left of it, whichever has room; never under the school panel (a dot under the panel shows no card).
- "Nearest support" in the hover card: I could not find it in the current code (the hover card only had the
  name and grade chip). The card now holds only name and grade. Check: if you saw it somewhere else, tell
  me where.
- Removed the All / Colleges / Universities filter (state, control, tests). PRD updated.
- School search at the top right (full width on phones): name, short name (UBC, SFU, BCIT), initials, or
  city. Arrow keys, Enter opens, Escape clears; choosing a school opens its panel and the map flies there.
- Legend docked to the bottom-left edge, stacked vertically. When a school panel is open on a wide screen
  it sits on the bottom edge right beside the panel. Decision: the crisis caption ("In danger? Call 911.
  Get help") is now the legend's last row, so the two can never collide. Phones: folded to one row,
  "Legend" plus the crisis line; the zoom buttons and attribution sit just above it.
- The dev-only Next.js badge is turned off (it sat on the legend in the bottom-left corner).
- test:map 45 of 45.

Part 2 done (commit: "Route to the nearest hospital emergency department"):
- Decision: the route goes to the nearest hospital with an emergency department, not to any DataBC
  "hospital". DataBC's list includes care homes and outpatient buildings (UBC Purdy Pavilion is long-term
  care, VGH Banfield is residential care, Jim Pattison is outpatient), and UBC's nearest "hospital" would
  have been one of them. 74 of 90 hospitals are marked ed: true, each with the health authority page that
  lists it (Fraser Health, edwaittimes.ca for VCH and Providence, Island Health, Interior Health, Northern
  Health; Cariboo Memorial and Invermere from their own IH pages). The other 16 keep their map cross but
  are never a route target; each has an ed_note saying why.
- Check: Bella Bella and Bella Coola are left unmarked because they are not on VCH's list; BC Children's is
  left out because its emergency department is for 16 and under.
- scripts/pipeline/hospital-routes.mts (npm run hospital-routes): routes the three nearest emergency
  hospitals by straight line with OSRM, keeps the shortest drive. 78 OSRM requests, saved to
  data/hospital-routes.json. All 26 are by road.
- Map: ink dotted line (round dots on a page-coloured casing), under the purple support line; in the
  legend as "Route to the nearest hospital". Both routes are framed together when close.
- Panel: a "Nearest emergency department" card (name, address, distance and drive time, phone, Directions,
  Emergency department status, Source), skipped when the support above already is that hospital.
- test:support 61 of 61 (new checks for the hospital routes).

Part 3 done (commit: "Campuses: every multi-campus school's main campuses"):
- Rule used for "main campuses": every location the school's own website calls a campus. Offices, learning
  and access centres, and satellite sites it does not call a campus are left out (listed in
  data/campus-sources.json, "_left_out").
- 55 campuses for 20 schools (SFU Surrey and Vancouver included). Each address is checked on the school's
  own page by scripts/pipeline/build-campuses.mts (npm run build:campuses) and geocoded with the Province's
  BC Address Geocoder (civic number, unit or block matches only). The check caught three wrong addresses
  from web search: NLC Tumbler Ridge is 235 Front Street (not 180 Southgate, a PO box), UNBC's Terrace
  campus is at 3120 Highway 16 East, Thornhill (not 4837 Keith Avenue), and CapU's Sunshine Coast campus is
  no longer on CapU's locations page.
- Check: left out CNC Fort St. James (its page does not show the address) and KPU Civic Plaza (no address
  on KPU's maps page). UNBC's Prince Rupert, Quesnel and Fort St. John campuses share buildings with CMTN,
  CNC and NLC, so their dots sit on the same spot.
- Map: smaller dots in the school's On paper colour (no ring: ratings are per school), in the legend.
  Hover shows the school and campus. Clicking opens /map/<school>/<campus>: the same panel and grade, with
  a Campus row (links, aria-current) and the support and routes for that campus. Search finds campuses
  ("sfu surrey", "bcit downtown").
- Routes per campus: 165 OSRM requests for hospital routes and 100 for support routes (all by road); the
  existing 49 support routes are unchanged. The support pipeline now reads the shared campus list
  (scripts/pipeline/campuses.mts) instead of the database.
- Decision: a far campus (more than 100 km from any hospital sexual assault service) leads with an
  emergency department, as before. Where its nearest one is not one of the three sourced Northern Health
  entries, the lead is the nearest one from the health authority's own list (DataBC address and phone,
  status page, Province's line). Before this, the pipeline would have sent Fort Nelson to Dawson Creek.
- Check: local phone lines for the new campus cities were not researched; those panels show the routed
  nearest support, the nearest emergency department and Here2Talk. Tumbler Ridge's nearest listed hospital
  emergency department is Chetwynd (96 km); its health centre is not in DataBC's hospital list.
- Tests: test:support 68, test:map 45, test:demo 18, accessibility 0 findings. Screenshots of /map and
  /map/sfu/surrey in both themes at 390 and 1440 checked; design critique run (one fix: a legend label
  that wrapped).

## 3. School panel

Done in 561459a.
- Removed the Call button from the action row. The row is now Ask, Website, Review, Listen (Request
  policy stays for a school with no public policy). The office phone is still listed under Who to contact,
  where it is the sexual violence office's own number.
- "Listen to this report card" is now the Listen button in the row (Stop while playing, Preparing while
  loading; aria-pressed).
- Decision on "Read the summary": it is needed for accessibility (the audio needs a text alternative,
  WCAG 1.2.1), so it stays as a proper secondary option. After Listen is tapped, a strip under the row says
  what is happening and has a "Show the text" button that opens the same summary.
- Tests: test:report-card 208 (Listen is in the row, no Call or Read the summary, transcript one tap away
  after Listen; the audio request is answered in the test so no ElevenLabs call is made), test:fixes 22
  (the extension check now uses the contact phone; the caption check now checks the legend). Screenshots of
  /map/uvic in both themes at 390 and 1440, plus the strip open, checked; design critique run, no changes.

## 4. Nav

Done in f83ffa7.
- Setup check: the project already has the shadcn structure (components.json, aliases ui = @/components/ui),
  Tailwind v4 and TypeScript, so nothing needed installing. The tabs are at components/ui/vercel-tabs.tsx,
  adapted: each tab is a Next.js Link, the active tab comes from the route (aria-current), keyboard focus
  moves the highlight like hover and shows a focus ring, colours are theme tokens (no hex), reduced motion
  turns the sliding off. No images or other dependencies.
- One list of destinations (lib/nav.ts): Map, Rate your school, How it works, Get support (purple), Sign in
  or Account. The Onus wordmark goes to the map (the footer wordmark still goes to the homepage).
- Decision: "My account" is now "Account" in the nav, as in the request.
- The tabs show from 768 px; below that, the menu button. The phone menu lists the same five, then Privacy
  and Sources in smaller text. Privacy and Sources were already in the footer (About column). The footer
  is not shown on the full-screen map, as before.
- Bug fixed: the phone menu now closes when the window is widened past 768 px.
- Tests: test:nav 25 (new checks: same destinations, order, wordmark to the map, aria-current per page,
  right-aligned, focus ring, footer links, smaller text, widening closes the menu; one run had a single
  failure that did not repeat in two reruns), test:account 11, test:auth 20, accessibility 0 findings.
  Screenshots checked; design critique run, no changes.

## 5. Rating flow and account

Done (commit: "Rating codes stay on the device; My account rebuilt").
- Done screen: no edit code. The thank-you line as written, Go to my account (opens Reviews) and Get
  support. Decision: I kept a quiet "Back to [School]" under a hairline, because the demo moment (the Onus
  count ticking up) depends on it. If the browser can't keep the code (private mode, storage blocked), the
  code is shown with a note, since it would otherwise be lost.
- The code is saved only in the browser (localStorage, lib/device-ratings.ts). The server is unchanged:
  ratings have no user ID, and has_rated (user and school, to stop double rating) is the only account link.
- My account: left column on wide screens, a row on phones (Profile, Privacy, Reviews; arrow keys work).
  Profile: school, role, masked email; no username shown.
- Decision (security): "school and role editable" is limited to what the school email proves, enforced in
  a new database function update_profile (migration 20261004000007, applied). School: only among schools
  sharing the email's domain (in practice UBC Vancouver and UBC Okanagan), and not after rating. Role:
  only on shared student and staff domains; where the domain sets the role it stays. Without this, anyone
  could switch to another school and rate it. Check: if you want anything looser, tell me.
- Privacy: what Onus stores (including the random username, which still exists in the database but is not
  shown anywhere), Sign out and Delete account side by side, delete behind "Are you sure?".
- Reviews: ratings made on this device, each with "Save a backup code" and Delete (behind "Are you sure?").
  None on this device: it explains ratings can't be traced to an account, by design. "Rated on another
  device? Use a backup code" deletes a rating anywhere. Deleting a rating withdraws it; that account still
  can't rate the same school again (the dialog says so), because has_rated stays.
- Privacy page updated to match (codes on the device, backup codes, what deleting removes).
- Tests: test:rate 28, test:account 25 (new: device list, backup code, both confirm dialogs, side by side,
  and the update_profile rules: switch within a shared domain, refuse another school, lock after rating,
  refuse a role set by the domain, refuse signed out), test:demo 18, accessibility 0 findings (new views:
  account Privacy, Reviews, the delete dialog, the campus panel, the Listen strip). Screenshots of the done
  screen and every account section in both themes at 390 and 1440 checked; design critique run (one fix: the
  rating date was the UTC date, now the local date).
