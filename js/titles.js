/*
 * Individual titles, ranked either by how much has been read or by how long they
 * are. Each row shows read against total as a meter, so a 40-chapter series read
 * to the end does not look like a 400-chapter one barely started.
 */

import { clear, element, formatCount, formatPercent } from './util.js';

const MODES = [
	{ key: 'mostRead', label: 'Most read', metric: (entry) => entry.chaptersRead },
	{ key: 'longest', label: 'Longest', metric: (entry) => entry.chapters }
];

export function createTitles({ panel, list, segment }) {
	let view = null;
	let mode = MODES[0];

	segment.addEventListener('click', (event) => {
		const button = event.target.closest('button[data-mode]');
		if (!button) {
			return;
		}
		mode = MODES.find((candidate) => candidate.key === button.dataset.mode) ?? MODES[0];
		for (const other of segment.querySelectorAll('button[data-mode]')) {
			other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
		}
		draw();
	});

	function render(next, library) {
		view = next;
		if (!library.available.chapters) {
			panel.hidden = true;
			return;
		}
		panel.hidden = false;
		draw();
	}

	function draw() {
		const rows = view.stats[mode.key];
		clear(list);

		if (!rows.length) {
			list.appendChild(element('div', 'empty', 'No titles with chapters in this selection.'));
			return;
		}

		const largest = rows.reduce((max, entry) => Math.max(max, mode.metric(entry) ?? 0), 0);

		for (const entry of rows) {
			const row = element('div', 'title-row');
			row.appendChild(element('span', 'title-name', entry.title));

			const track = element('span', 'title-track');
			track.style.width = `${Math.max((mode.metric(entry) / largest) * 100, 1)}%`;

			// The read portion is the filled part of the title's own length.
			const readShare = entry.chapters ? Math.min((entry.chaptersRead ?? 0) / entry.chapters, 1) : 0;
			const fill = element('span', 'title-fill');
			fill.style.width = `${readShare * 100}%`;
			track.appendChild(fill);

			const meter = element('span', 'title-meter');
			meter.appendChild(track);
			row.appendChild(meter);

			row.appendChild(
				element(
					'span',
					'title-value',
					`${formatCount(entry.chaptersRead ?? 0)}/${formatCount(entry.chapters ?? 0)}`
				)
			);
			row.appendChild(element('span', 'title-share', formatPercent(entry.chaptersRead ?? 0, entry.chapters ?? 0, 0)));

			list.appendChild(row);
		}
	}

	return { render };
}
