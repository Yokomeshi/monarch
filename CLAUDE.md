# Investor — an investing knowledge wiki

Plain-Markdown LLM wiki: point Claude at this folder and ask questions.
Seeded from Michael Burry's "Cassandra Unchained" Substack articles; other
sources may be added later. The general pattern is documented in
`llm-wiki-architecture.md`.

## Layers

1. `raw/` — original, immutable sources (PDFs as captured). Never edit.
2. `articles/`, `entities/`, `concepts/` — the wiki: normalized pages.
3. `CLAUDE.md` — this schema and the workflows.

## Folder map

- `raw/` — source PDFs, original filenames, never edited after capture
- `articles/` — one page per article, kebab-case slug filenames
- `entities/` — companies (one page per ticker) and people referenced by articles
- `concepts/` — cross-article investing themes, frameworks, and reference notes
- `index.md` — every article on one line, grouped by series
- `log.md` — append-only chronological record of ingests and notable changes

## Article page format

```markdown
---
type: article
title: "Foundations: The Tragic Algebra of Stock-Based Compensation"
series: foundations
published: 2026-03-14
tickers: [PLTR, CRWD]
source: "[[michael-burry]]"
raw: "Foundations_ The Tragic Algebra of Stock-Based Compensation.pdf"
tags: [sbc, dilution, accounting]
added: 2026-07-21
---

# Foundations: The Tragic Algebra of Stock-Based Compensation

## Summary
2–4 sentences: what the article argues and why it matters.

## Key arguments
- ...

## Data points
- Specific numbers, chart takeaways, tables worth keeping.

## Trades
- Only when the post discloses positions or moves (Trading Posts, Trade Alerts).

## Notes
- Reader observations, cross-references, caveats.
```

Field rules:

- `type`: `article` | `note`. `note` is the lightweight variant for short,
  meta, or administrative posts (e.g. feature announcements); notes may skip
  body sections beyond `## Summary`.
- `series` (controlled vocabulary):
  `foundations` — evergreen essays on method, history, market structure
  `trading-post` — portfolio updates and market commentary
  `short-thoughts` — shorter dated commentary
  `deep-dive` — company- or sector-specific analysis
  `recurrence` — "Recurrence" reposts of earlier work with new framing
  `trade-alert` — position-change alerts
  `meta` — announcements and housekeeping posts
- `published`: YYYY-MM-DD from the post byline. `unknown` if truly absent.
- `tickers`: uppercase exchange tickers of companies materially discussed;
  `[]` if none. Passing mentions don't count.
- `source`: wikilink to the author entity, e.g. `"[[michael-burry]]"`.
- `raw`: exact filename of the source PDF in `raw/`.
- `tags`: themes with no field of their own (e.g. `ai-bubble`, `sbc`,
  `passive-investing`, `short-thesis`, `market-history`). Reuse existing
  spellings before inventing new ones. Never repeat a field's value.
- `added`: YYYY-MM-DD the page was created.
- Stay faithful to the source: record claims as the author's views
  ("Burry argues..."), never as established fact. Normalize formatting,
  never substance.
- `[[wikilinks]]` connect pages. Link tickers/people to `entities/` and
  themes to `concepts/` in body text. A link to a page that doesn't exist
  yet is fine — it flags a page worth creating.
- International listings: entity slugs use the company name
  (`tencent`, `haidilao`, `samsung-electronics`), with the primary local
  ticker in the entity's `ticker:` field (e.g. `0700.HK`); article
  frontmatter `tickers:` may use whichever form the post used (ADR, OTC,
  or local code).

## Entity & concept pages

Entity (`entities/<slug>.md` — companies use the lowercase ticker as slug):

```markdown
---
type: company            # company | person
title: Palantir Technologies
ticker: PLTR             # companies only
description: One-line description.
tags: [ai, software]
updated: 2026-07-21
---

# Palantir Technologies

One-paragraph summary of the author's stance and its evolution.

## Articles
- [[palantir-an-accounting]] — ...one-line note...
```

Concept (`concepts/<slug>.md`): same minimal schema without `ticker`;
the body synthesizes the idea across articles and lists the articles that
develop it.

## Ingest workflow

When a new article arrives (PDF, paste, URL):

1. Capture the source into `raw/` exactly as received. Never edit it after.
2. Normalize into `articles/<slug>.md` using the schema above. Read the PDF
   visually (charts matter, not just text). Slug: kebab-case short title.
3. Link entities/concepts — create or update pages for any company, person,
   or theme materially discussed; cross-link both directions.
4. Update `index.md` — one line under the article's series heading:
   `- [[<slug>]] — <title> (<published>)`.
5. Append to `log.md` — `## [YYYY-MM-DD] ingest | <title>` plus a one-line note.

## Querying

Frontmatter + grep answer questions like:

- "What is Burry's NVDA thesis?" — grep `tickers:.*NVDA` in `articles/`, read
  matches, plus `entities/nvda.md` for the synthesis.
- "List his disclosed trades chronologically" — grep `## Trades` pages,
  order by `published`.
- "Which posts discuss stock-based compensation?" — grep `tags:.*sbc`.
- "How has his AI-bubble view evolved?" — `concepts/ai-bubble.md` plus its
  linked articles in `published` order.
