/*
 * The donut and the figure in its middle.
 *
 * Slices are drawn in the fixed colour order, separated by a 2px gap in the
 * surface colour, and direct-labelled only where the arc genuinely fits the text.
 */

import { clear, element, formatCount, formatPercent, slotColor, slotLabelInk, svgElement } from './util.js';
import { genreTip } from './tooltip.js';

const CENTRE = 160;
const OUTER_RADIUS = 148;
const INNER_RADIUS = 92;
/* Below roughly 21 degrees the percentage no longer fits inside the band. */
const MIN_LABEL_ANGLE = 0.36;

export function createDonut({ dial, svg, hub, tooltip, highlight }) {
	let view = null;

	highlight.subscribe((name) => {
		dial.dataset.hot = name ? 'yes' : 'no';
		for (const slice of svg.querySelectorAll('.slice')) {
			slice.dataset.on = slice.dataset.name === name ? 'yes' : 'no';
		}
		renderHub(name);
	});

	function render(next) {
		view = next;
		clear(svg);

		const title = svgElement('title', { id: 'donutTitle' });
		title.textContent = 'Donut chart of each genre as a share of all genre tags in view';
		svg.appendChild(title);

		const total = view.result.totalTags;
		if (!total) {
			svg.appendChild(
				svgElement('circle', {
					cx: CENTRE,
					cy: CENTRE,
					r: (OUTER_RADIUS + INNER_RADIUS) / 2,
					fill: 'none',
					stroke: 'var(--hairline)',
					'stroke-width': OUTER_RADIUS - INNER_RADIUS
				})
			);
			renderHub(null);
			return;
		}

		let cursor = -Math.PI / 2;
		for (const row of view.slices) {
			const span = (row.count / total) * Math.PI * 2;
			const start = cursor;
			cursor += span;
			drawSlice(row, start, span, total);
		}

		renderHub(highlight.current);
	}

	function drawSlice(row, start, span, total) {
		const end = start + span;
		// A single slice covering the whole ring cannot be one arc.
		const definitions =
			span >= Math.PI * 2 - 1e-6
				? [arcPath(start, start + Math.PI), arcPath(start + Math.PI, start + Math.PI * 2)]
				: [arcPath(start, end)];

		for (const definition of definitions) {
			const slice = svgElement('path', {
				d: definition,
				fill: slotColor(row.slot),
				class: 'slice',
				tabindex: '0',
				role: 'img',
				'aria-label':
					`${row.name}: ${formatPercent(row.count, total)} of genre tags, ` +
					`on ${formatCount(row.count)} of ${formatCount(view.result.titlesInView)} titles`
			});
			slice.dataset.name = row.name;
			slice.dataset.on = 'no';
			bind(slice, row);
			svg.appendChild(slice);
		}

		if (span >= MIN_LABEL_ANGLE) {
			const middle = start + span / 2;
			const radius = (OUTER_RADIUS + INNER_RADIUS) / 2;
			const label = svgElement('text', {
				x: (CENTRE + radius * Math.cos(middle)).toFixed(2),
				y: (CENTRE + radius * Math.sin(middle)).toFixed(2),
				class: 'slice-label',
				'dominant-baseline': 'central'
			});
			label.style.fill = slotLabelInk(row.slot);
			label.textContent = `${Math.round((row.count / total) * 100)}%`;
			svg.appendChild(label);
		}
	}

	function bind(slice, row) {
		const enter = (event) => {
			highlight.set(row.name);
			const box = slice.getBoundingClientRect();
			tooltip.show(
				{
					x: event.clientX || box.left + box.width / 2,
					y: event.clientY || box.top
				},
				genreTip(row, view, slotColor(row.slot))
			);
		};
		const leave = () => {
			highlight.set(null);
			tooltip.hide();
		};

		slice.addEventListener('pointerenter', enter);
		slice.addEventListener('pointermove', enter);
		slice.addEventListener('pointerleave', leave);
		// Keyboard focus shows exactly what hover shows.
		slice.addEventListener('focus', enter);
		slice.addEventListener('blur', leave);
	}

	function renderHub(name) {
		clear(hub);
		if (!view) {
			return;
		}

		const { totalTags, titlesInView } = view.result;
		const hot = name ? view.slices.find((row) => row.name === name) : null;

		if (hot) {
			hub.appendChild(element('div', 'figure', formatPercent(hot.count, totalTags)));
			const caption = element('div', 'caption');
			caption.appendChild(element('b', undefined, hot.name));
			caption.append(
				hot.slot === null
					? `${formatCount(view.otherGenres)} genres`
					: `${formatCount(hot.count)} of ${formatCount(titlesInView)} titles`
			);
			hub.appendChild(caption);
			return;
		}

		hub.appendChild(element('div', 'figure', formatCount(totalTags)));
		const caption = element('div', 'caption');
		caption.appendChild(element('b', undefined, 'genre tags'));
		caption.append(`across ${formatCount(titlesInView)} titles`);
		hub.appendChild(caption);
	}

	return { render };
}

function arcPath(start, end) {
	const large = end - start > Math.PI ? 1 : 0;
	const point = (radius, angle) => [
		(CENTRE + radius * Math.cos(angle)).toFixed(2),
		(CENTRE + radius * Math.sin(angle)).toFixed(2)
	];
	const [ax, ay] = point(OUTER_RADIUS, start);
	const [bx, by] = point(OUTER_RADIUS, end);
	const [cx, cy] = point(INNER_RADIUS, end);
	const [dx, dy] = point(INNER_RADIUS, start);

	return [
		`M${ax} ${ay}`,
		`A${OUTER_RADIUS} ${OUTER_RADIUS} 0 ${large} 1 ${bx} ${by}`,
		`L${cx} ${cy}`,
		`A${INNER_RADIUS} ${INNER_RADIUS} 0 ${large} 0 ${dx} ${dy}`,
		'Z'
	].join(' ');
}
