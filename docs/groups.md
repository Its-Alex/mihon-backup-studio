# How entries are grouped

Every entry gets exactly one group. Grouping is computed in the browser from the backup and the thresholds on the
Settings page; it is never written into the backup. It only drives the dashboard, the library map, the Entries filters
and the Cleanup suggestions.

Groups are assigned by `analyze()` in [`src/lib/backup/analysis.ts`](../src/lib/backup/analysis.ts) with the first
matching rule winning, so the order below is the order in which an entry is tested.

| # | Group | Assigned when |
|---|-------|---------------|
| 1 | Not in library | The entry is not a favourite. Older copies kept for their reading progress end up here. |
| 2 | Duplicate | Another library entry has the same normalized title and more progress. The most-read copy stays in its normal group; every other copy is a duplicate. |
| 3 | Extension missing | The entry's source has no name in the backup, meaning the extension was not installed when the backup was made. |
| 4 | Active | The last-read date is at most `activeDays` days old. |
| 5 | Caught up · frozen source | Caught up, and the source is frozen. |
| 6 | Caught up · source updating | Caught up, the source is not frozen, and the entry's newest chapter was uploaded at most `silentDays` days ago. |
| 7 | Caught up · source silent | Caught up and the newest chapter is older than `silentDays`: the series ended, is on hiatus or stalled. |
| 8 | Not started · frozen source | At most `notStartedMaxRead` chapters read, and the source is frozen. |
| 9 | Not started | At most `notStartedMaxRead` chapters read. |
| 10 | Behind · frozen source | More chapters read than `notStartedMaxRead`, unread chapters remain, the entry is not active, and the source is frozen. |
| 11 | Behind | Same as above with a source that still updates. |

## What the terms mean

- **Last read** — the newest history entry for the title across every copy, not just this entry. Migrating an entry to
  another source copies its read chapters but leaves its history behind, so the old copy's history is used to date the
  new one. The UI marks a recovered date with ↩.
- **Caught up** — the entry has chapters and either at most one unread chapter, or its highest read chapter number is at
  least its highest chapter number.
- **Source updating** — the newest chapter of the entry was uploaded within `silentDays`. This is per entry, so a
  caught-up series is judged on when its own last chapter appeared.
- **Frozen source** — detected per source, from library entries only, since copies outside the library stop refreshing:
  a source is frozen when at least `frozenSourceMinEntries` library entries carry a chapter upload date and at least
  `frozenSourceShare` of them have a newest upload older than `frozenSourceDays`. Settings can override the detection
  per source.

## Defaults

| Setting | Default | Used for |
|---------|---------|----------|
| `activeDays` | 60 | Active |
| `silentDays` | 365 | Caught up · updating vs silent |
| `notStartedMaxRead` | 2 | Not started vs behind |
| `frozenSourceDays` | 500 | Whether an entry counts as stale for its source |
| `frozenSourceShare` | 50% | Share of stale entries that makes a source frozen |
| `frozenSourceMinEntries` | 10 | Minimum library entries before a source is judged at all |

Thresholds are stored in the browser, not in the backup, and reset with **Restore defaults** on the Settings page.

## Where the groups appear

The dashboard and the library map list library groups only, so they leave out **Not in library**; that group is visible
in Entries and drives the Cleanup suggestions for empty copies. Entries lists every group, including **Not in library**.
