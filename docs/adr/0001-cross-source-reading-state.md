# 1. Read the same title across sources, not one source at a time

- **Status:** Accepted
- **Date:** 2026-10-19

## Context

A Mihon backup stores each entry against the source it came from. The same work usually exists on several sources, and
users migrate between them when a source dies or a better scanlation appears. Mihon's migration copies the read
chapters to the new entry but leaves the reading history on the old one, so after a migration:

- the new entry carries the chapter progress but no last-read date;
- the old entry holds the history but is no longer in the library;
- the same work is present two or three times in the file.

Judged one entry at a time, a series read yesterday looks unread for over a year, and the old copies look like
abandoned entries worth deleting. Judged one source at a time, a dead source looks like a series nobody reads.

## Decision

Treat every copy of a title as evidence about the same work, and combine it:

1. **Match titles across all entries**, library or not, with `normalizeTitle()`
   ([`analysis.ts:106`](../../src/lib/backup/analysis.ts#L106-L112)): lowercase, strip accents, drop parenthesized and
   bracketed parts, drop `the`, keep letters and digits.
2. **Recover the last-read date from the newest history of any copy**
   ([`analysis.ts:134`](../../src/lib/backup/analysis.ts#L134-L156),
   [`analysis.ts:238`](../../src/lib/backup/analysis.ts#L238-L239)). The date the UI shows is the newest across
   copies, and `lastReadRecovered` marks it with ↩ when it did not come from the entry itself.
3. **Detect duplicates across sources** ([`analysis.ts:220`](../../src/lib/backup/analysis.ts#L220-L234)). Among
   library copies of one normalized title, the one with the most read chapters stays; every other copy becomes
   `duplicate` and is offered for removal in Cleanup.
4. **Aggregate reading time per work**, not per entry, for the dashboard's top-read ranking
   ([`+page.svelte:52`](../../src/routes/+page.svelte#L52-L69)).

What stays per entry and per source:

- **Chapter state and progress** are read from the entry's own chapters; a copy is not credited with its twin's
  chapters.
- **Source health** is computed per source key, and only from library entries
  ([`analysis.ts:186`](../../src/lib/backup/analysis.ts#L186-L191)): copies outside the library stop refreshing, so
  they cannot tell whether a source still publishes.
- **Grouping** still assigns each entry its own group. A merged work can therefore show up as `caughtUpSilent` on the
  live source and `behindFrozen` on the dead one; merging dates does not hide the fact that one copy is stale.

## Consequences

Positive:

- Reading activity survives a migration, so migrated series are not reported as abandoned.
- Old copies become visible as duplicates instead of being silently counted as separate library entries.
- Deleting an old copy is an informed choice: Cleanup lists "Old copies holding history" and says the recovered dates
  are lost if the copy goes ([`cleanup.ts:121`](../../src/lib/backup/cleanup.ts#L121-L133)).

Negative and risks:

- **False merges.** Two different works sharing a normalized title (a remake, a spin-off, a generic title such as
  "Batman", or the same title translated differently) are treated as one. Their histories and duplicates then mix.
- **Normalization is lossy.** Parenthesized volume or edition markers are dropped, `the` is removed with English in
  mind, and accents are stripped. Two editions may collapse into one.
- **No corroborating field.** Author, artist and URL are not compared, so nothing guards against a title collision.
- **Ties are arbitrary.** When copies have the same read count and no history, the duplicate pick falls back to file
  order.
- **Deleting history copies is irreversible in the tool's own terms.** The backup changes after export; the recovered
  dates disappear with the copy.

## Alternatives considered

- **Use only the entry's own data.** Simple and free of false merges, but a migrated library reads as abandoned and
  duplicate entries go unnoticed. Rejected: it is the main failure this tool exists to surface.
- **Match by source URL.** URLs are source-specific by definition and never match across sources. Rejected.
- **Match by author, artist and title.** Would reduce title collisions, but those fields are often missing or spelled
  differently per source. Possible refinement, not a replacement.
- **Rely on Mihon's migration record.** Mihon does not store a migration link in the backup; there is nothing to read.
  Rejected.
- **Ask the user to confirm every merge.** Accurate, but turns a whole-library overview into one decision per entry.
  Rejected for the default analysis; the duplicate group plus Cleanup review keeps the human in the loop where it
  matters.
