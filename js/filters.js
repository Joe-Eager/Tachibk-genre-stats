/*
 * One filter row, above everything it scopes: every chart, the summary strip and
 * the table all re-render against the same slice.
 *
 * Created once and mounted again whenever a different export is loaded, so the
 * control listeners are never stacked twice on the same button.
 */

import { clear, element, formatCount } from './util.js';

export function createFilters({ elements, state, getLibrary, onChange }) {
	elements.sourceReset.addEventListener('click', () => {
		for (const source of getLibrary().sources) {
			state.sources.add(source.index);
		}
		drawSourceChips();
		onChange();
	});

	elements.sliceSeg.addEventListener('click', (event) => {
		const button = event.target.closest('button[data-slices]');
		if (!button) {
			return;
		}
		state.sliceCount = Number(button.dataset.slices);
		for (const other of elements.sliceSeg.querySelectorAll('button[data-slices]')) {
			other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
		}
		onChange();
	});

	elements.excludeFormat.addEventListener('change', () => {
		state.excludeFormat = elements.excludeFormat.checked;
		onChange();
	});

	function mount() {
		drawSourceChips();
		for (const button of elements.sliceSeg.querySelectorAll('button[data-slices]')) {
			button.setAttribute('aria-pressed', Number(button.dataset.slices) === state.sliceCount ? 'true' : 'false');
		}
		elements.excludeFormat.checked = state.excludeFormat;
	}

	function drawSourceChips() {
		clear(elements.sourceChips);

		for (const source of getLibrary().sources) {
			const chip = element('button', 'chip');
			chip.type = 'button';
			chip.setAttribute('aria-pressed', state.sources.has(source.index) ? 'true' : 'false');
			chip.append(
				element('span', 'tick', '✓'),
				element('span', undefined, source.name),
				element('span', 'n', formatCount(source.titles))
			);

			chip.addEventListener('click', () => {
				// Never let the last source come off; an empty chart says nothing.
				if (state.sources.has(source.index) && state.sources.size === 1) {
					return;
				}
				if (state.sources.has(source.index)) {
					state.sources.delete(source.index);
				} else {
					state.sources.add(source.index);
				}
				chip.setAttribute('aria-pressed', state.sources.has(source.index) ? 'true' : 'false');
				updateSourceLabel();
				onChange();
			});

			elements.sourceChips.appendChild(chip);
		}

		updateSourceLabel();
	}

	function updateSourceLabel() {
		const total = getLibrary().sources.length;
		elements.sourceLabel.textContent =
			state.sources.size === total ? 'Sources' : `Sources (${state.sources.size} of ${total})`;
	}

	return { mount };
}
