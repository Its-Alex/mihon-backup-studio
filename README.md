# Mihon Backup Studio

Inspect, clean up and edit a [Mihon](https://mihon.app) backup (`.tachibk`) in the browser. The file is decoded, edited
and re-encoded locally; nothing is uploaded.

- **Dashboard**: library size, categories broken down by reading state, last-read activity, time spent reading, and
  which sources still update.
- **Library map**: every library entry grouped by category, then by state (active, caught up, behind, not started,
  frozen source, duplicate, missing extension).
- **Entries**: search, filter and bulk-edit: move between categories, remove from or add to the library, delete. Each
  entry opens a panel to edit details, categories and read chapters, and to clear its history.
- **Categories**: create, rename, reorder, delete (optionally moving their entries elsewhere).
- **Cleanup**: suggested batches (duplicates, missing extensions, frozen sources, abandoned series, empty copies) to
  review and apply.
- **Export**: download the edited backup. Every field the tool does not edit is copied byte for byte.

## Run it

[mise](https://mise.jdx.dev) pins the Node.js version (`mise.toml`) and wraps the npm scripts:

```sh
mise install       # install the pinned Node.js
mise run install   # npm ci
mise run dev       # http://localhost:5173
mise run build     # static site in build/, serve it with `mise run preview` or any static host
mise tasks         # list every task
```

## GitHub Pages

`.github/workflows/deploy.yml` type-checks, tests, builds and publishes the site on every push to `main`. The build
sets `BASE_PATH` to `/<repository name>`, so the site lives at `https://<user>.github.io/<repository name>/`. In the
repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.

## Restoring an edited backup

Mihon merges a restore into the existing library: an entry stays in the library if it is there on the device or in the
backup, and the device's own titles and details win. Removals, deletions and detail edits therefore only take effect
when restoring into an empty app (clear Mihon's storage or reinstall, then restore). Keep the original backup.

## How reading dates are worked out

Migrating an entry to another source copies its read chapters but leaves its history on the old entry, which then sits
outside the library. The analysis matches entries by normalized title and uses the newest history of any copy as the
last-read date (marked ↩ in the UI). Ages are measured from the newest timestamp in the backup, not from today.

## How entries are grouped

Each entry lands in exactly one group — active, caught up, behind, not started, duplicate, missing extension, or outside
the library — and frozen sources split some of them further. The rules, their evaluation order and every threshold are
documented in [docs/groups.md](docs/groups.md).

## Development

```sh
mise run test                                   # unit tests
MIHON_BACKUP=/path/to/file.tachibk mise run test  # also checks a real backup round-trips byte for byte
mise run ci                                     # check, test and build, as the deploy workflow does
```

In dev mode, `?backup=<url>` loads a backup from a URL (the server must send CORS headers), which avoids picking the
file by hand on every reload.
