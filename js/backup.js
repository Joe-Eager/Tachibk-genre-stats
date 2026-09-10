/*
 * Reading a Mihon backup, whichever shape it arrives in.
 *
 * A .tachibk (and its .proto.gz twin) is gzip-compressed protobuf; the JSON is
 * the same structure already decoded. Both are normalised to one shape here, so
 * data.js never needs to know which format it came from.
 *
 * Field numbers come from Mihon's own backup schema (proto2):
 *   Backup        backupManga = 1   backupSources = 101
 *   BackupManga   source = 1  title = 3  genre = 7  status = 8
 *                 chapters = 16  history = 104
 *   BackupChapter read = 4  bookmark = 5
 *   BackupHistory readDuration = 3
 *   BackupSource  name = 1   sourceId = 2
 * Only those are read; every other field is stepped over without decoding.
 *
 * Backups vary in what they carry: an older export may have no chapter or
 * history data at all. Anything absent stays null rather than becoming a zero,
 * so the page can say it is missing instead of reporting a false total.
 */

import { asSigned64, Reader, WIRE_BYTES, WIRE_VARINT } from './protobuf.js';

const FIELD_BACKUP_MANGA = 1;
const FIELD_BACKUP_SOURCES = 101;

const FIELD_MANGA_SOURCE = 1;
const FIELD_MANGA_TITLE = 3;
const FIELD_MANGA_GENRE = 7;
const FIELD_MANGA_STATUS = 8;
const FIELD_MANGA_CHAPTERS = 16;
const FIELD_MANGA_HISTORY = 104;

const FIELD_CHAPTER_READ = 4;
const FIELD_CHAPTER_BOOKMARK = 5;

const FIELD_HISTORY_DURATION = 3;

const FIELD_SOURCE_NAME = 1;
const FIELD_SOURCE_ID = 2;

const GZIP_MAGIC = [0x1f, 0x8b];

export async function fetchBackup(url) {
	let response;
	try {
		response = await fetch(url, { cache: 'no-store' });
	} catch (cause) {
		const error = new Error(
			`Could not reach ${url}. This page reads the file over HTTP, so it needs to be served rather than ` +
				'opened straight from disk.',
			{ cause }
		);
		// Only this failure is fixed by starting a server; a 404 or a damaged
		// backup is not.
		error.needsServer = true;
		throw error;
	}

	if (!response.ok) {
		throw new Error(`Could not read ${url}: the server answered ${response.status} ${response.statusText}.`);
	}

	return readBackup(new Uint8Array(await response.arrayBuffer()), url);
}

export async function readBackupFile(file) {
	return readBackup(new Uint8Array(await file.arrayBuffer()), file.name);
}

/*
 * Decides what the bytes are by looking at them rather than at the file name, so
 * a backup still loads when it has been renamed.
 */
export async function readBackup(bytes, label = 'backup') {
	if (!bytes.length) {
		throw new Error(`${label} is empty.`);
	}

	if (looksLikeJson(bytes)) {
		let parsed;
		try {
			parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
		} catch (cause) {
			throw new Error(`${label} looks like JSON but could not be parsed.`, { cause });
		}
		return normaliseJson(parsed);
	}

	const payload = isGzip(bytes) ? await gunzip(bytes, label) : bytes;

	try {
		return decodeBackup(payload);
	} catch (cause) {
		// Wire-format complaints are noise to someone who picked the wrong file;
		// only say something specific when the file really was a backup.
		if (cause.isBackup) {
			throw cause;
		}
		throw new Error(
			`${label} is not a Mihon backup. Pick a .tachibk or .proto.gz file, or the JSON-decoded version of one.`,
			{ cause }
		);
	}
}

function looksLikeJson(bytes) {
	// Skip a UTF-8 BOM and any leading whitespace, then look for an object.
	let index = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
	while (index < bytes.length && (bytes[index] === 0x20 || (bytes[index] >= 0x09 && bytes[index] <= 0x0d))) {
		index += 1;
	}
	return bytes[index] === 0x7b; // {
}

function isGzip(bytes) {
	return bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

async function gunzip(bytes, label) {
	if (typeof DecompressionStream !== 'function') {
		throw new Error(
			`${label} is compressed, and this browser cannot decompress it. Load the JSON-decoded backup instead.`
		);
	}

	try {
		const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
		return new Uint8Array(await new Response(stream).arrayBuffer());
	} catch (cause) {
		throw new Error(`${label} is gzip-compressed but the data is damaged.`, { cause });
	}
}

function emptyTitle() {
	return {
		title: '',
		sourceId: '0',
		genres: [],
		status: null,
		chapters: null,
		chaptersRead: null,
		bookmarks: null,
		readDurationMs: null,
		historyRows: null
	};
}

/* Walks the top-level Backup message, descending only into the useful fields. */
export function decodeBackup(bytes) {
	const reader = new Reader(bytes);
	const titles = [];
	const sources = [];

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_BACKUP_MANGA && wire === WIRE_BYTES) {
			titles.push(decodeManga(reader.view()));
		} else if (field === FIELD_BACKUP_SOURCES && wire === WIRE_BYTES) {
			sources.push(decodeSource(reader.view()));
		} else {
			reader.skip(wire);
		}
	}

	if (!titles.length) {
		// Structurally valid, just empty: worth saying plainly.
		const error = new Error('That backup has no library entries in it.');
		error.isBackup = true;
		throw error;
	}

	return { titles, sources };
}

function decodeManga(bytes) {
	const reader = new Reader(bytes);
	const manga = emptyTitle();

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_MANGA_SOURCE && wire === WIRE_VARINT) {
			// Source ids run past 2^53, so they stay text rather than becoming a
			// Number that rounds.
			manga.sourceId = String(asSigned64(reader.varint()));
		} else if (field === FIELD_MANGA_TITLE && wire === WIRE_BYTES) {
			manga.title = reader.string();
		} else if (field === FIELD_MANGA_GENRE && wire === WIRE_BYTES) {
			manga.genres.push(reader.string());
		} else if (field === FIELD_MANGA_STATUS && wire === WIRE_VARINT) {
			manga.status = Number(asSigned64(reader.varint()));
		} else if (field === FIELD_MANGA_CHAPTERS && wire === WIRE_BYTES) {
			const chapter = decodeChapter(reader.view());
			manga.chapters = (manga.chapters ?? 0) + 1;
			manga.chaptersRead = (manga.chaptersRead ?? 0) + (chapter.read ? 1 : 0);
			manga.bookmarks = (manga.bookmarks ?? 0) + (chapter.bookmark ? 1 : 0);
		} else if (field === FIELD_MANGA_HISTORY && wire === WIRE_BYTES) {
			const duration = decodeHistoryDuration(reader.view());
			manga.historyRows = (manga.historyRows ?? 0) + 1;
			manga.readDurationMs = (manga.readDurationMs ?? 0) + duration;
		} else {
			reader.skip(wire);
		}
	}

	return manga;
}

function decodeChapter(bytes) {
	const reader = new Reader(bytes);
	let read = false;
	let bookmark = false;

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_CHAPTER_READ && wire === WIRE_VARINT) {
			read = reader.varint() !== 0n;
		} else if (field === FIELD_CHAPTER_BOOKMARK && wire === WIRE_VARINT) {
			bookmark = reader.varint() !== 0n;
		} else {
			reader.skip(wire);
		}
	}

	return { read, bookmark };
}

function decodeHistoryDuration(bytes) {
	const reader = new Reader(bytes);
	let duration = 0;

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_HISTORY_DURATION && wire === WIRE_VARINT) {
			duration = Number(asSigned64(reader.varint()));
		} else {
			reader.skip(wire);
		}
	}

	return duration;
}

function decodeSource(bytes) {
	const reader = new Reader(bytes);
	const source = { id: '0', name: '' };

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_SOURCE_NAME && wire === WIRE_BYTES) {
			source.name = reader.string();
		} else if (field === FIELD_SOURCE_ID && wire === WIRE_VARINT) {
			source.id = String(asSigned64(reader.varint()));
		} else {
			reader.skip(wire);
		}
	}

	return source;
}

/*
 * The JSON export carries the same field names as the schema, so it is folded
 * into the same shape. A key that is absent stays null; a chapter list that is
 * present but empty is a real zero.
 */
function normaliseJson(parsed) {
	if (!parsed || !Array.isArray(parsed.backupManga)) {
		throw new Error(
			'That JSON is not a Mihon backup: it has no backupManga list. Export one with Mihon Backup Viewer.'
		);
	}

	const titles = parsed.backupManga
		.filter((entry) => entry && typeof entry === 'object')
		.map((entry) => {
			const manga = emptyTitle();
			manga.title = String(entry.title ?? 'Untitled');
			manga.sourceId = String(entry.source ?? '0');
			manga.genres = Array.isArray(entry.genre) ? entry.genre.map((genre) => String(genre)) : [];
			manga.status = Number.isFinite(Number(entry.status)) && entry.status !== undefined ? Number(entry.status) : null;

			if (Array.isArray(entry.chapters)) {
				manga.chapters = entry.chapters.length;
				manga.chaptersRead = entry.chapters.filter((chapter) => chapter && chapter.read).length;
				manga.bookmarks = entry.chapters.filter((chapter) => chapter && chapter.bookmark).length;
			}

			if (Array.isArray(entry.history)) {
				manga.historyRows = entry.history.length;
				manga.readDurationMs = entry.history.reduce(
					(sum, row) => sum + (Number(row?.readDuration) || 0),
					0
				);
			}

			return manga;
		});

	if (!titles.length) {
		const error = new Error('That backup has no library entries in it.');
		error.isBackup = true;
		throw error;
	}

	const sources = (Array.isArray(parsed.backupSources) ? parsed.backupSources : [])
		.filter((source) => source && source.sourceId !== undefined)
		.map((source) => ({ id: String(source.sourceId), name: source.name || String(source.sourceId) }));

	return { titles, sources };
}
