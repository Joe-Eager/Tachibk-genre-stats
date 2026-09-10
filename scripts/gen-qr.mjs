/*
 * Generates site-qr.svg: a QR code for the published site with rounded data
 * dots, rounded finder "eyes", and the page's own donut mark in the middle.
 * Error correction level H keeps it scannable with the logo covering the centre.
 *
 * The output is committed, so the site itself stays dependency-free. This script
 * is the only thing that needs a package, and only when the URL changes:
 *
 *   npm install --no-save qrcode && node scripts/gen-qr.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import QRCode from 'qrcode';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SITE_URL = 'https://cheese-greater.github.io/Tachibk-genre-stats/';
const OUT = resolve(root, 'site-qr.svg');
const LOGO = resolve(root, 'favicon.svg');

const CELL = 10; // px per module
const MARGIN = 4; // quiet-zone modules, per the QR spec
const DARK = '#0b0b0b';
const LIGHT = '#ffffff';

/*
 * Styling trades scannability against looks, so both knobs are overridable.
 *
 * Modules are rounded squares at full cell size, NOT separated dots: detached
 * dots look better but break decoding. Measured by rasterising the output and
 * decoding it, circles of radius 0.44 and 0.48 modules both failed outright,
 * and only radius 0.50 (just touching) scraped through. Full-size rounded
 * squares share whole edges with their neighbours, which binarises cleanly.
 * The logo is not the constraint: 0.26 decodes fine.
 */
const LOGO_RATIO = Number(process.env.QR_LOGO_RATIO ?? 0.26); // logo + padding, as a fraction of the code
const MODULE_RADIUS = Number(process.env.QR_MODULE_RADIUS ?? 0.3); // corner radius in modules; 0 is a hard grid

const qr = QRCode.create(SITE_URL, { errorCorrectionLevel: 'H' });
const size = qr.modules.size;
const data = qr.modules.data;
const isDark = (row, column) =>
	row >= 0 && column >= 0 && row < size && column < size && !!data[row * size + column];

/* The three 7x7 finder patterns sit at these top-left corners. */
const finders = [
	[0, 0],
	[0, size - 7],
	[size - 7, 0]
];
const inFinder = (row, column) =>
	finders.some(([top, left]) => row >= top && row < top + 7 && column >= left && column < left + 7);

const pixel = (value) => Number((value * CELL).toFixed(2));
const parts = [];

/* Data modules: full-size rounded squares, so neighbours stay connected. */
for (let row = 0; row < size; row += 1) {
	for (let column = 0; column < size; column += 1) {
		if (!isDark(row, column) || inFinder(row, column)) {
			continue;
		}
		parts.push(
			`<rect x="${pixel(MARGIN + column)}" y="${pixel(MARGIN + row)}" width="${CELL}" height="${CELL}" ` +
				`rx="${pixel(MODULE_RADIUS)}"/>`
		);
	}
}

/* Finder patterns: a rounded ring with a rounded core. */
for (const [top, left] of finders) {
	const x = pixel(MARGIN + left);
	const y = pixel(MARGIN + top);
	const outer = pixel(7);
	const stroke = pixel(1);
	parts.push(
		`<rect x="${x + stroke / 2}" y="${y + stroke / 2}" width="${outer - stroke}" height="${outer - stroke}" ` +
			`rx="${pixel(1.75)}" fill="none" stroke="${DARK}" stroke-width="${stroke}"/>`
	);
	parts.push(
		`<rect x="${pixel(MARGIN + left + 2)}" y="${pixel(MARGIN + top + 2)}" width="${pixel(3)}" ` +
			`height="${pixel(3)}" rx="${pixel(0.9)}"/>`
	);
}

/* Punch a hole for the logo and drop the donut mark into it. */
const canvas = pixel(size + MARGIN * 2);
const logoBox = Number((canvas * LOGO_RATIO).toFixed(2));
const logoOrigin = Number(((canvas - logoBox) / 2).toFixed(2));
const padding = Number((logoBox * 0.12).toFixed(2));

const logo = readFileSync(LOGO, 'utf8')
	// Strip the XML prolog and comments so it can nest inside this document.
	.replace(/<\?xml[\s\S]*?\?>/g, '')
	.replace(/<!--[\s\S]*?-->/g, '')
	.trim();

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="QR code linking to ${SITE_URL}">
<title>${SITE_URL}</title>
<rect width="${canvas}" height="${canvas}" rx="${pixel(2)}" fill="${LIGHT}"/>
<g fill="${DARK}">
${parts.join('\n')}
</g>
<rect x="${logoOrigin - padding}" y="${logoOrigin - padding}" width="${logoBox + padding * 2}" height="${logoBox + padding * 2}" rx="${pixel(1.2)}" fill="${LIGHT}"/>
<svg x="${logoOrigin}" y="${logoOrigin}" width="${logoBox}" height="${logoBox}" viewBox="0 0 32 32">
${logo.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim()}
</svg>
</svg>
`;

writeFileSync(OUT, svg);

console.log(`url      : ${SITE_URL}`);
console.log(`modules  : ${size}x${size} (error correction H)`);
console.log(`canvas   : ${canvas}x${canvas}px`);
console.log(`dots     : ${parts.length}`);
console.log(`wrote    : ${OUT}`);
