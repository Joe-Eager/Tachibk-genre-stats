/*
 * The full ranking, which is what the donut cannot show: the top slices cover
 * well under half the tags, and the tail runs to hundreds of genres.
 *
 * One series, so one colour for every bar. Colouring bars darker-where-bigger
 * would just re-encode the length that the bar already shows.
 */

import { clear, element, formatCount, formatPercent, slotColor } from './util.js';

const PREVIEW_ROWS = 25;

export function createBars({ container, moreButton, tooltip, library }) {
	let view = null;
	let expanded = false;

	moreButton.addEventListener('click', () => {
		expanded = !expanded;
		draw();
	});

	function render(next) {
		view = next;
		draw();
	}

	function draw() {
		clear(container);
		const { ranked, totalTags, titlesInView } = view.result;

		if (!ranked.length) {
			container.appendChild(element('div', 'empty', 'No genre tags in this selection.'));
			moreButton.hidden = true;
			return;
		}

		const rows = expanded ? ranked : ranked.slice(0, PREVIEW_ROWS);
		const largest = ranked[0].count;

		for (const row of rows) {
			const line = element('div', 'bar-row');

			const track = element('span', 'track');
			const fill = element('span', 'fill');
			fill.style.width = `${Math.max((row.count / largest) * 100, 0.6)}%`;
			track.appendChild(fill);

			line.append(
				element('span', 'cat', row.name),
				track,
				// Every bar is direct-labelled, so the chart needs no gridlines.
				element('span', 'val', formatPercent(row.count, totalTags))
			);

			const slot = library.slotOf.get(row.name);
			const payload = {
				value: `${formatPercent(row.count, totalTags)} of tags`,
				name: row.name,
				color: slot === undefined ? 'var(--series-1)' : slotColor(slot),
				foot: `On ${formatCount(row.count)} of ${formatCount(titlesInView)} titles (${formatPercent(row.count, titlesInView)})`
			};

			const enter = (event) => tooltip.show({ x: event.clientX, y: event.clientY }, payload);
			line.addEventListener('pointerenter', enter);
			line.addEventListener('pointermove', enter);
			line.addEventListener('pointerleave', tooltip.hide);

			container.appendChild(line);
		}

		moreButton.hidden = ranked.length <= PREVIEW_ROWS;
		moreButton.textContent = expanded
			? `Show the top ${PREVIEW_ROWS} only`
			: `Show all ${formatCount(ranked.length)} genres`;
	}

	return { render };
}
