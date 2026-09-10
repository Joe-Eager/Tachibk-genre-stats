/*
 * The table view: the same numbers with no reliance on colour, and the place
 * both denominators sit side by side. Three of the light palette steps fall
 * below 3:1 against the surface, which is why this view is not optional.
 */

import { clear, element, formatCount, formatPercent, slotColor } from './util.js';

const COLUMNS = [
	{ key: 'name', label: 'Genre' },
	{ key: 'count', label: 'Titles' },
	{ key: 'tagShare', label: 'Share of tags' },
	{ key: 'titleShare', label: 'On titles' }
];

export function createTable({ head, body, library, state }) {
	let view = null;
	let sortKey = 'count';
	let sortDirection = 'desc';

	function render(next) {
		view = next;
		draw();
	}

	function draw() {
		const { ranked, totalTags, titlesInView } = view.result;

		const rows = ranked
			.map((row) => ({
				name: row.name,
				count: row.count,
				tagShare: totalTags ? row.count / totalTags : 0,
				titleShare: titlesInView ? row.count / titlesInView : 0,
				slot: library.slotOf.get(row.name)
			}))
			.sort((a, b) => {
				const direction = sortDirection === 'asc' ? 1 : -1;
				if (sortKey === 'name') {
					return a.name.localeCompare(b.name) * direction;
				}
				return (a[sortKey] - b[sortKey]) * direction || a.name.localeCompare(b.name);
			});

		drawHead();
		drawBody(rows, totalTags, titlesInView);
	}

	function drawHead() {
		clear(head);
		const row = document.createElement('tr');

		for (const column of COLUMNS) {
			const cell = document.createElement('th');
			cell.scope = 'col';

			const button = element('button', undefined, column.label);
			button.type = 'button';
			if (sortKey === column.key) {
				cell.setAttribute('aria-sort', sortDirection === 'asc' ? 'ascending' : 'descending');
				button.appendChild(element('span', 'dir', sortDirection === 'asc' ? ' ↑' : ' ↓'));
			}
			button.addEventListener('click', () => {
				if (sortKey === column.key) {
					sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
				} else {
					sortKey = column.key;
					sortDirection = column.key === 'name' ? 'asc' : 'desc';
				}
				draw();
			});

			cell.appendChild(button);
			row.appendChild(cell);
		}

		head.appendChild(row);
	}

	function drawBody(rows, totalTags, titlesInView) {
		clear(body);

		if (!rows.length) {
			const line = document.createElement('tr');
			const cell = element('td', 'empty', 'No genre tags in this selection.');
			cell.colSpan = COLUMNS.length;
			line.appendChild(cell);
			body.appendChild(line);
			return;
		}

		for (const row of rows) {
			const line = document.createElement('tr');

			const nameCell = document.createElement('td');
			const keyed = element('div', 'keyed');
			const swatch = element('span', 'swatch');
			// Only the genres actually drawn as slices wear their slice colour.
			const drawnAsSlice = row.slot !== undefined && row.slot < state.sliceCount;
			swatch.style.background = drawnAsSlice ? slotColor(row.slot) : 'var(--series-other)';
			keyed.append(swatch, element('span', undefined, row.name));
			nameCell.appendChild(keyed);

			line.append(
				nameCell,
				element('td', 'num', formatCount(row.count)),
				element('td', 'num', formatPercent(row.count, totalTags)),
				element('td', 'num', formatPercent(row.count, titlesInView))
			);

			body.appendChild(line);
		}
	}

	return { render };
}
