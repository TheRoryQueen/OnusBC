# CLAUDE.md: Onus

You are building Onus, a live map that grades how BC colleges and universities handle sexual violence. docs/PRD.md is the source of truth. docs/components.md holds the reference component code and how to adapt each piece.

## Start of every session
1. Read docs/PRD.md (at least the sections for the task at hand) and the current milestone in "Build handoff: order of work".
2. Before any UI work, load the frontend-design and design-taste-frontend skills, and read the matching section of docs/components.md.
3. Work one milestone at a time. Don't start the next until the current one passes its "Done when" check.

**Real data only (non-negotiable).** Every number, statistic, school fact, chart value, and quote shown anywhere on the site must come from a real, linkable source, stored with its source URL (for example in data/sources.json or the public\_records table). Never invent, estimate, round up, or fill a chart with placeholder values. If a number cannot be sourced, leave the element out and flag it to Farnaz. The only exception is the seeded sample ratings, which are always stored as source = 'sample' and counted separately in the panel's "sample" number.

## Rules

- Read docs/PRD.md before any task; it is the source of truth. Ask before changing any decision in it. Before building any UI piece, read its section in docs/components.md and apply its Onus adaptation note.
- Never commit secrets; never expose the service role key to the browser.
- Never invent grades, quotes, statistics, chart values, or contacts (see Real data only above). Seed ratings are the only non-real data and are always stored as source = 'sample'. Before writing or changing any UI, load the frontend-design and design-taste-frontend skills.
- Ratings are written only through submit\_rating and edit\_rating. Never add a user ID to the ratings table.
- No free-text fields anywhere in the product.
- Follow the Design system section exactly: system font, capsules, concentric corners, glass only on floating controls, no bordered cards, no gradients, no emoji, no em dashes in UI copy.
- Every page must work at 390 px wide and in both themes. After building or changing a page, run the dev server, take Playwright screenshots at 390x844 and 1440x900 in light and dark mode, look at every screenshot against the Design system and the anti-AI rules (use the design:design-critique skill if it is installed), fix what's off, and only then commit.
- Commit locally after each milestone with a clear message. Do not create a remote, push, or deploy until the final deploy milestone.


## Design skills (install once, after milestone 1 scaffolding)
```
npx skills add https://github.com/anthropics/skills --skill frontend-design
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"
```

## Data files
- data/quotes.json: the only quotes allowed on the site. Render only entries with "approved": true. Never add, reword, or replace a quote.
- data/sources.json: every number shown on the site and its source link. If a number isn't here with a source, it doesn't ship.

## Copy
Never use em dashes anywhere in UI copy, code comments shown to users, or docs written for Farnaz.
