/*
 * One floating readout shared by the donut, the legend and the ranked bars.
 * Tooltips only ever enhance: every value they show is also on the page as a
 * direct label, a legend value or a table row.
 */

import { clear, element, formatCount, formatPercent } from './util.js';

export function createTooltip(node) {
	function show(anchor, rows) {
		clear(node);
		// The value leads and the genre name follows: the reader already knows
		// which mark they are pointing at and wants the number.
		node.appendChild(element('div', 'tip-value', rows.value));

		const key = element('div', 'tip-key');
		const stroke = element('span', 'stroke');
		stroke.style.background = rows.color;
		key.append(stroke, element('span', undefined, rows.name));
		node.appendChild(key);

		node.appendChild(element('div', 'tip-foot', rows.foot));
		node.hidden = false;

		const box = node.getBoundingClientRect();
		const x = Math.min(Math.max(anchor.x, box.width / 2 + 8), window.innerWidth - box.width / 2 - 8);
		// Flip below the pointer when there is no room above.
		const y = anchor.y - box.height - 12 < 8 ? anchor.y + box.height + 24 : anchor.y;
		node.style.left = `${x}px`;
		node.style.top = `${y}px`;
	}

	function hide() {
		node.hidden = true;
	}

	window.addEventListener('scroll', hide, { passive: true });

	return { show, hide };
}

/* The tooltip body for one genre, in both denominators. */
export function genreTip(row, view, color) {
	const { totalTags, titlesInView } = view.result;
	const pooled = row.slot === null;

	return {
		value: `${formatPercent(row.count, totalTags)} of tags`,
		name: row.name,
		color,
		foot: pooled
			? `${formatCount(view.otherGenres)} genres outside the named slices`
			: `On ${formatCount(row.count)} of ${formatCount(titlesInView)} titles (${formatPercent(row.count, titlesInView)})`
	};
}
