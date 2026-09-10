/*
 * The legend is the dependable identity channel: it names every slice and
 * carries its value, so nothing on the page depends on matching colours by eye.
 */

import { clear, element, formatCount, formatPercent, slotColor } from './util.js';
import { genreTip } from './tooltip.js';

export function createLegend({ list, tooltip, highlight }) {
	highlight.subscribe((name) => {
		for (const item of list.children) {
			if (item.dataset.name) {
				item.dataset.on = item.dataset.name === name ? 'yes' : 'no';
			}
		}
	});

	function render(view) {
		clear(list);

		if (!view.slices.length) {
			list.appendChild(element('li', 'caption', 'No genre tags in this selection.'));
			return;
		}

		const total = view.result.totalTags;

		for (const row of view.slices) {
			const item = element('li');
			item.dataset.name = row.name;
			item.dataset.on = 'no';

			const swatch = element('span', 'swatch');
			swatch.style.background = slotColor(row.slot);

			item.append(
				swatch,
				element('span', 'name', row.name),
				element('span', 'share', formatPercent(row.count, total)),
				element(
					'span',
					'titles',
					row.slot === null ? `${formatCount(view.otherGenres)} genres` : `${formatCount(row.count)} titles`
				)
			);

			const enter = (event) => {
				highlight.set(row.name);
				tooltip.show({ x: event.clientX, y: event.clientY }, genreTip(row, view, slotColor(row.slot)));
			};
			item.addEventListener('pointerenter', enter);
			item.addEventListener('pointermove', enter);
			item.addEventListener('pointerleave', () => {
				highlight.set(null);
				tooltip.hide();
			});

			list.appendChild(item);
		}

		list.appendChild(
			element(
				'li',
				'caption',
				`Share of ${formatCount(total)} tag assignments. Titles counts the titles carrying that genre.`
			)
		);
	}

	return { render };
}
