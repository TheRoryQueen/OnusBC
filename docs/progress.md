# Progress log (October 3, 2026 request)

This file always shows where the work is, in case the session stops. Items run in order; each is committed
with this file updated. Item 7 is the one called "item 6" in the request (the stricter grading).

| # | Item | Status | Commit |
| --- | --- | --- | --- |
| 1 | Haven, Tillicum Lelum and CDCSS as phone-only lines; handoff | Done | 44e0403 |
| 2 | Map: hover cards, filter, search, legend, hospital routes, campuses | In progress (part 1 of 3 done) | see below |
| 3 | School panel: Call, Listen, Read the summary | Not started | |
| 4 | Nav: same destinations, footer links, phone menu bug, tabs | Not started | |
| 5 | Rating flow and account | Not started | |
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

Left: part 2 (route to the nearest hospital), part 3 (campuses).
