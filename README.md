# Genres read

A static page that charts the genre mix of a Mihon library. The visitor supplies
the backup: drop a file on the page, or pick one. Nothing is read from the server
and nothing is uploaded, so it is safe to host for anyone to use.

## Run it

```
python -m http.server 8000
```

or

```
npx serve .
```

Then open http://localhost:8000. Any static host works the same way (GitHub
Pages, Netlify, Cloudflare Pages); there is no build step and no backend.

**Do not deploy a backup alongside it.** Anything in this folder is served
publicly, so a `.tachibk` left here is a public URL that exposes your library.
`.gitignore` excludes backup files for that reason.

## Input formats

Both shapes of a Mihon backup work, and the format is detected from the bytes
rather than the file name, so a renamed backup still loads:

- **`.tachibk`** / **`.proto.gz`**: gzip-compressed protobuf, decompressed with
  the browser's native `DecompressionStream` and decoded by `js/protobuf.js`.
- **`.json`**: the same structure already decoded, as exported by
  [Mihon Backup Viewer](https://github.com/Animeboynz/Mihon-Backup-Viewer).

To export one from Mihon: Settings, then Data and storage, then Create backup.

Only four fields are read (`BackupManga.source`, `.title`, `.genre` and
`BackupSource.name`/`.sourceId`); everything else in the backup is skipped
without being decoded. Source ids run past 2^53, so they are decoded as `BigInt`
and kept as text.

`?data=<url>` loads a backup from the server instead of asking for one, for
anyone hosting their own copy beside a file they are happy to serve publicly.
It is the only case where this page fetches data.

## What it shows

Each title carries a flat list of genre tags, several per title. That makes two
different percentages, and the page shows both.

- **Share of tags** divides by every tag assignment in view. The slices add up
  to 100%, so the donut is a true part-to-whole.
- **On titles** divides by the titles in view. One title carries several
  genres, so these add up to well over 100%.

Controls, all of which scope every panel at once:

- **Sources** filters by the reader source a title was saved from. Worth trying:
  sources tag at wildly different depths, so excluding the most verbose one can
  collapse the genre count by an order of magnitude.
- **Slices** sets how many named genres the donut draws before pooling the rest.
- **Drop format tags** ignores nine publishing tags that sit in the same list as
  real genres (`Manga`, `Adaptation`, `Based on a Novel` and similar). It is on
  by default, since `Manga` is otherwise one of the largest "genres".
- **Load another backup** charts a different file.

A genre keeps the same colour no matter how you filter, so narrowing the sources
rescales the chart without repainting the genres that stay on screen.

Spellings that differ only by case (`Sci-fi` and `Sci-Fi`) are counted as one
genre under the most-used form, and the page says which were merged.

## Layout

```
index.html        markup: a landing pane and a report pane
styles.css        tokens, both colour schemes, all component styles
favicon.svg       the page's own donut mark, in the first three chart hues
favicon.ico       32px and 16px fallback for browsers without SVG icons
js/app.js         file intake, filter state, drives the panels
js/backup.js      format sniffing, gunzip, Mihon backup field numbers
js/protobuf.js    minimal protobuf wire-format reader
js/data.js        indexing and counting (no DOM, no network)
js/donut.js       the donut and its centre figure
js/legend.js      named slices with values
js/bars.js        the full ranking
js/table.js       sortable table view
js/filters.js     the filter row
js/tooltip.js     shared hover readout
js/highlight.js   shared hover state between donut and legend
js/util.js        formatting and DOM helpers
```

No dependencies. The only network request is the Google Fonts stylesheet for
IBM Plex; the page falls back to system sans without it.
