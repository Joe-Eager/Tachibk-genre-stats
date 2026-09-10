/*
 * Just enough protobuf wire format to walk a message and pick out named fields.
 *
 * A backup carries every chapter and history row for every title, so this reader
 * never decodes eagerly: unknown fields are stepped over without allocating, and
 * nested messages are handed back as views into the original bytes.
 *
 * Wire types (https://protobuf.dev/programming-guides/encoding/):
 *   0 varint  1 fixed64  2 length-delimited  5 fixed32
 */

const TEXT = new TextDecoder('utf-8');

export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_BYTES = 2;
export const WIRE_FIXED32 = 5;

/* Varints are at most 10 bytes, the tenth carrying bit 63. */
const MAX_VARINT_BYTES = 10;
const TWO_63 = 1n << 63n;
const TWO_64 = 1n << 64n;

export class Reader {
	constructor(bytes) {
		this.bytes = bytes;
		this.position = 0;
	}

	get done() {
		return this.position >= this.bytes.length;
	}

	/* Reads a varint as BigInt: int64 field values overflow Number. */
	varint() {
		let result = 0n;
		let shift = 0n;

		for (let read = 0; read < MAX_VARINT_BYTES; read += 1) {
			if (this.position >= this.bytes.length) {
				throw new Error('Backup ended in the middle of a number.');
			}
			const byte = this.bytes[this.position];
			this.position += 1;
			result |= BigInt(byte & 0x7f) << shift;
			if ((byte & 0x80) === 0) {
				return result & (TWO_64 - 1n);
			}
			shift += 7n;
		}

		throw new Error('Backup contains a malformed number.');
	}

	/* Field key: the field number and how its value is encoded. */
	key() {
		const value = this.varint();
		return { field: Number(value >> 3n), wire: Number(value & 7n) };
	}

	/* A length-delimited value, as a view rather than a copy. */
	view() {
		const length = Number(this.varint());
		const start = this.position;
		this.position += length;
		if (this.position > this.bytes.length) {
			throw new Error('Backup declares a field longer than the file.');
		}
		return this.bytes.subarray(start, this.position);
	}

	string() {
		return TEXT.decode(this.view());
	}

	/* Steps over a field this reader does not care about. */
	skip(wire) {
		switch (wire) {
			case WIRE_VARINT:
				this.varint();
				break;
			case WIRE_FIXED64:
				this.position += 8;
				break;
			case WIRE_BYTES: {
				// The length must be read before position is advanced: `position +=`
				// would capture position from before the length varint was consumed.
				const length = Number(this.varint());
				this.position += length;
				break;
			}
			case WIRE_FIXED32:
				this.position += 4;
				break;
			default:
				// Wire types 3 and 4 are the removed group encoding; nothing in a
				// Mihon backup uses them, and guessing a length would desync.
				throw new Error(`Backup uses an unsupported field encoding (${wire}).`);
		}

		if (this.position > this.bytes.length) {
			throw new Error('Backup ended in the middle of a field.');
		}
	}
}

/* Reinterprets an unsigned 64-bit varint as the signed value protobuf meant. */
export function asSigned64(value) {
	return value >= TWO_63 ? value - TWO_64 : value;
}
