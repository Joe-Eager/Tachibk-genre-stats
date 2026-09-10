/*
 * Shaping and counting. Nothing here touches the DOM or the network: it takes a
 * normalised backup from backup.js, whichever file format that came out of.
 *
 * A title carries a flat list of genre tags, so the interesting numbers come in
 * two flavours that must never be confused: a genre's share of all TAG
 * ASSIGNMENTS (adds up to 100%, so a pie is honest) and the share of TITLES
 * carrying it (adds up to far more than 100%).
 *
 * Every aggregate distinguishes absent from zero. A backup without chapter data
 * yields null, not 0, so the page can say the data is missing.
 */

/*
 * Tags describing how a title was published rather than what it is about. They
 * sit in the same flat genre list as real genres, and "Manga" alone lands on a
 * large share of titles, which would make it a top-six "genre".
 */
export const FORMAT_TAGS = [
	'Adaptation',
	'Adapted To Full Color Manga',
	'Based on a Novel',
	'Based on a Webnovel',
	'Manga',
	'Manhwa',
	'Translator',
	'Webtoon/Webcomic',
	'Webtoons'
];

/* The categorical palette has eight slots; past that the tail is pooled. */
export const SLOT_COUNT = 8;
export const OTHER_LABEL = 'Other genres';

/*
 * Mihon stores publication status as the SManga integer constants. Anything not
 * listed is reported by its number rather than guessed at.
 */
const STATUS_NAMES = new Map([
	[0, 'Unknown'],
	[1, 'Ongoing'],
	[2, 'Completed'],
	[3, 'Licensed'],
	[4, 'Publishing finished'],
	[5, 'Cancelled'],
	[6, 'On hiatus']
]);

export function statusName(status) {
	if (status === null) {
		return 'Not recorded';
	}
	return STATUS_NAMES.get(status) ?? `Status ${status}`;
}

/*
 * Indexes a normalised backup: genre names are deduplicated into one array and
 * every title keeps a list of genre indexes.
 */
export function buildLibrary(parsed) {
	const sourceNames = new Map(parsed.sources.map((source) => [source.id, source.name]));

	const spellings = collectSpellings(parsed.titles);
	const { canonical, merges } = resolveSpellings(spellings);

	const sources = [];
	const sourceIndexes = new Map();
	const genres = [];
	const genreIndexes = new Map();
	const titles = [];

	for (const entry of parsed.titles) {
		if (!sourceIndexes.has(entry.sourceId)) {
			sourceIndexes.set(entry.sourceId, sources.length);
			sources.push({
				index: sources.length,
				name: sourceNames.get(entry.sourceId) || entry.sourceId,
				titles: 0
			});
		}
		const sourceIndex = sourceIndexes.get(entry.sourceId);
		sources[sourceIndex].titles += 1;

		// One title tagged "Action" twice, or as both "Sci-fi" and "Sci-Fi",
		// must not count twice.
		const seen = new Set();
		const genreList = [];
		for (const rawGenre of entry.genres) {
			const name = canonical.get(String(rawGenre).trim().toLowerCase());
			if (!name || seen.has(name)) {
				continue;
			}
			seen.add(name);
			if (!genreIndexes.has(name)) {
				genreIndexes.set(name, genres.length);
				genres.push(name);
			}
			genreList.push(genreIndexes.get(name));
		}

		titles.push({
			title: entry.title,
			source: sourceIndex,
			genres: genreList,
			status: entry.status,
			chapters: entry.chapters,
			chaptersRead: entry.chaptersRead,
			bookmarks: entry.bookmarks,
			readDurationMs: entry.readDurationMs,
			historyRows: entry.historyRows
		});
	}

	const formatKeys = new Set(FORMAT_TAGS.map((name) => name.toLowerCase()));
	const formatFlags = genres.map((name) => formatKeys.has(name.toLowerCase()));

	const library = {
		sources,
		genres,
		titles,
		formatFlags,
		formatNames: genres.filter((name, index) => formatFlags[index]),
		merges,
		totalTags: titles.reduce((sum, entry) => sum + entry.genres.length, 0),
		// What this particular backup actually contains.
		available: {
			genres: titles.some((entry) => entry.genres.length > 0),
			chapters: titles.some((entry) => entry.chapters !== null),
			readState: titles.some((entry) => entry.chaptersRead !== null),
			history: titles.some((entry) => entry.readDurationMs !== null),
			status: titles.some((entry) => entry.status !== null),
			bookmarks: titles.some((entry) => entry.bookmarks !== null)
		}
	};

	/*
	 * Colour is bound to the genre itself, taken from the whole library once, so
	 * that filtering sources rescales the chart without ever repainting the
	 * genres that stay on screen.
	 */
	const everySource = sources.map((source) => source.index);
	const overall = tally(library, everySource, true);
	library.slotOrder = overall.ranked.slice(0, SLOT_COUNT).map((row) => row.name);
	library.slotOf = new Map(library.slotOrder.map((name, slot) => [name, slot]));

	return library;
}

/* How often each exact spelling of a genre name appears, and where it first did. */
function collectSpellings(entries) {
	const spellings = new Map();
	let order = 0;

	for (const entry of entries) {
		for (const rawGenre of entry.genres) {
			const name = String(rawGenre).trim();
			if (!name) {
				continue;
			}
			const existing = spellings.get(name);
			if (existing) {
				existing.count += 1;
			} else {
				spellings.set(name, { count: 1, order: order++ });
			}
		}
	}

	return spellings;
}

/*
 * Different sources spell the same genre differently: a backup can carry both
 * "Sci-fi" and "Sci-Fi", which are one genre and must not split into two slices.
 * The most-used spelling becomes the display name, first-seen breaking a tie.
 */
function resolveSpellings(spellings) {
	const canonical = new Map();
	const winners = new Map();
	const variants = new Map();

	for (const [name, info] of spellings) {
		const key = name.toLowerCase();

		if (!variants.has(key)) {
			variants.set(key, []);
		}
		variants.get(key).push(name);

		const winner = winners.get(key);
		if (!winner || info.count > winner.count || (info.count === winner.count && info.order < winner.order)) {
			winners.set(key, info);
			canonical.set(key, name);
		}
	}

	const merges = [];
	for (const [key, spelled] of variants) {
		if (spelled.length > 1) {
			merges.push({ name: canonical.get(key), variants: spelled.slice().sort() });
		}
	}

	return { canonical, merges };
}

/* Counts genre tags across the chosen sources. */
export function tally(library, sourceIndexes, excludeFormat) {
	const wanted = new Set(sourceIndexes);
	const counts = new Array(library.genres.length).fill(0);
	let titlesInView = 0;
	let totalTags = 0;

	for (const entry of library.titles) {
		if (!wanted.has(entry.source)) {
			continue;
		}
		titlesInView += 1;
		for (const genreIndex of entry.genres) {
			if (excludeFormat && library.formatFlags[genreIndex]) {
				continue;
			}
			counts[genreIndex] += 1;
			totalTags += 1;
		}
	}

	// A genre's tag count is also its title count, because tags are deduplicated
	// per title above.
	const ranked = counts
		.map((count, genreIndex) => ({ name: library.genres[genreIndex], count }))
		.filter((row) => row.count > 0)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	return { ranked, titlesInView, totalTags };
}

/*
 * The chapter, progress and status aggregates for the chosen sources. Each is
 * null when the backup carries nothing to add up.
 */
export function summarise(library, sourceIndexes) {
	const wanted = new Set(sourceIndexes);
	const rows = library.titles.filter((entry) => wanted.has(entry.source));

	const sum = (pick) => {
		let total = null;
		for (const entry of rows) {
			const value = pick(entry);
			if (value !== null && value !== undefined) {
				total = (total ?? 0) + value;
			}
		}
		return total;
	};

	const progress = { finished: 0, started: 0, unread: 0, unknown: 0 };
	for (const entry of rows) {
		if (entry.chapters === null || entry.chaptersRead === null || entry.chapters === 0) {
			progress.unknown += 1;
		} else if (entry.chaptersRead >= entry.chapters) {
			progress.finished += 1;
		} else if (entry.chaptersRead > 0) {
			progress.started += 1;
		} else {
			progress.unread += 1;
		}
	}

	const statusCounts = new Map();
	for (const entry of rows) {
		const key = entry.status;
		statusCounts.set(key, (statusCounts.get(key) || 0) + 1);
	}
	const statuses = [...statusCounts.entries()]
		.map(([status, count]) => ({ status, name: statusName(status), count }))
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	// Titles ranked by how much of them has been read.
	const mostRead = rows
		.filter((entry) => (entry.chaptersRead ?? 0) > 0)
		.sort((a, b) => b.chaptersRead - a.chaptersRead || a.title.localeCompare(b.title))
		.slice(0, 12);

	const longest = rows
		.filter((entry) => (entry.chapters ?? 0) > 0)
		.sort((a, b) => b.chapters - a.chapters || a.title.localeCompare(b.title))
		.slice(0, 12);

	return {
		titles: rows.length,
		chapters: sum((entry) => entry.chapters),
		chaptersRead: sum((entry) => entry.chaptersRead),
		bookmarks: sum((entry) => entry.bookmarks),
		readDurationMs: sum((entry) => entry.readDurationMs),
		historyRows: sum((entry) => entry.historyRows),
		progress,
		statuses,
		mostRead,
		longest
	};
}

/*
 * Everything the charts render for one filter state: the named slices drawn from
 * the fixed colour order, plus one pooled slice for the tail.
 */
export function buildView(library, state) {
	const chosen = library.sources.map((source) => source.index).filter((index) => state.sources.has(index));
	const result = tally(library, chosen, state.excludeFormat);
	const counts = new Map(result.ranked.map((row) => [row.name, row.count]));

	const slices = library.slotOrder
		.slice(0, state.sliceCount)
		.map((name) => ({ name, count: counts.get(name) || 0, slot: library.slotOf.get(name) }))
		.filter((row) => row.count > 0)
		.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

	const namedTags = slices.reduce((sum, row) => sum + row.count, 0);
	const otherTags = result.totalTags - namedTags;
	const otherGenres = Math.max(result.ranked.length - slices.length, 0);

	if (otherTags > 0) {
		slices.push({ name: OTHER_LABEL, count: otherTags, slot: null });
	}

	return {
		chosen,
		result,
		slices,
		otherGenres,
		namedShown: slices.filter((row) => row.slot !== null).length,
		stats: summarise(library, chosen)
	};
}

/* Average tags per title for each source, densest first. */
export function tagDensityBySource(library, excludeFormat) {
	return library.sources
		.map((source) => {
			const solo = tally(library, [source.index], excludeFormat);
			return {
				name: source.name,
				titles: solo.titlesInView,
				perTitle: solo.titlesInView ? solo.totalTags / solo.titlesInView : 0
			};
		})
		.sort((a, b) => b.perTitle - a.perTitle);
}
