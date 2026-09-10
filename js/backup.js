/*
 * Reading a Mihon backup, whichever shape it arrives in.
 *
 * A .tachibk (and its .proto.gz twin) is gzip-compressed protobuf; the JSON is
 * the same structure already decoded. Everything here funnels into the one shape
 * data.js parses: { backupManga: [{ source, title, genre }], backupSources: [...] }.
 *
 * Field numbers come from Mihon's own backup schema (proto2):
 *   Backup       backupManga = 1     backupSources = 101
 *   BackupManga  source = 1  title = 3  genre = 7
 *   BackupSource name = 1    sourceId = 2
 * Only those are read; every other field is stepped over.
 */

import { asSigned64, Reader, WIRE_BYTES, WIRE_VARINT } from './protobuf.js';

const FIELD_BACKUP_MANGA = 1;
const FIELD_BACKUP_SOURCES = 101;

const FIELD_MANGA_SOURCE = 1;
const FIELD_MANGA_TITLE = 3;
const FIELD_MANGA_GENRE = 7;

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
		try {
			return JSON.parse(new TextDecoder('utf-8').decode(bytes));
		} catch (cause) {
			throw new Error(`${label} looks like JSON but could not be parsed.`, { cause });
		}
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

/* Walks the top-level Backup message, descending only into the two useful fields. */
export function decodeBackup(bytes) {
	const reader = new Reader(bytes);
	const backupManga = [];
	const backupSources = [];

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_BACKUP_MANGA && wire === WIRE_BYTES) {
			backupManga.push(decodeManga(reader.view()));
		} else if (field === FIELD_BACKUP_SOURCES && wire === WIRE_BYTES) {
			backupSources.push(decodeSource(reader.view()));
		} else {
			reader.skip(wire);
		}
	}

	if (!backupManga.length) {
		// Structurally valid, just empty: worth saying plainly.
		const error = new Error('That backup has no library entries in it.');
		error.isBackup = true;
		throw error;
	}

	return { backupManga, backupSources };
}

function decodeManga(bytes) {
	const reader = new Reader(bytes);
	const manga = { source: '0', title: '', genre: [] };

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_MANGA_SOURCE && wire === WIRE_VARINT) {
			// Source ids run past 2^53, so they stay text rather than becoming
			// a Number that rounds.
			manga.source = String(asSigned64(reader.varint()));
		} else if (field === FIELD_MANGA_TITLE && wire === WIRE_BYTES) {
			manga.title = reader.string();
		} else if (field === FIELD_MANGA_GENRE && wire === WIRE_BYTES) {
			manga.genre.push(reader.string());
		} else {
			reader.skip(wire);
		}
	}

	return manga;
}

function decodeSource(bytes) {
	const reader = new Reader(bytes);
	const source = { sourceId: '0', name: '' };

	while (!reader.done) {
		const { field, wire } = reader.key();

		if (field === FIELD_SOURCE_NAME && wire === WIRE_BYTES) {
			source.name = reader.string();
		} else if (field === FIELD_SOURCE_ID && wire === WIRE_VARINT) {
			source.sourceId = String(asSigned64(reader.varint()));
		} else {
			reader.skip(wire);
		}
	}

	return source;
}
