/*
 * Dark/light switching between Dracula and Alucard.
 *
 * The theme is already stamped on <html> by the inline script in the document
 * head, which runs before first paint so there is no flash of the wrong theme.
 * This module only owns the control: it reads the stamp, swaps it, and persists
 * the choice.
 */

export const STORAGE_KEY = 'theme';
export const DARK = 'dracula';
export const LIGHT = 'alucard';

const MOON = 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z';
const SUN_CIRCLE = 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z';
const SUN_RAYS =
	'M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12';

export function createTheme({ button, icon }) {
	function current() {
		return document.documentElement.dataset.theme === LIGHT ? LIGHT : DARK;
	}

	function apply(theme) {
		document.documentElement.dataset.theme = theme;
		try {
			localStorage.setItem(STORAGE_KEY, theme);
		} catch {
			// Private windows and blocked site data: the choice just will not stick.
		}
		paint(theme);
	}

	function paint(theme) {
		const dark = theme === DARK;
		button.setAttribute('aria-checked', dark ? 'true' : 'false');
		button.setAttribute('aria-label', dark ? 'Dark theme' : 'Light theme');

		// A moon while dark, a sun while light, matching what is switched to.
		icon.replaceChildren();
		if (dark) {
			icon.setAttribute('fill', 'currentColor');
			icon.setAttribute('stroke', 'none');
			icon.appendChild(path(MOON));
		} else {
			icon.setAttribute('fill', 'none');
			icon.setAttribute('stroke', 'currentColor');
			icon.setAttribute('stroke-width', '2');
			icon.setAttribute('stroke-linecap', 'round');
			icon.appendChild(path(SUN_CIRCLE, 'currentColor'));
			icon.appendChild(path(SUN_RAYS));
		}
	}

	function path(definition, fill) {
		const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		node.setAttribute('d', definition);
		if (fill) {
			node.setAttribute('fill', fill);
		}
		return node;
	}

	button.addEventListener('click', () => {
		apply(current() === DARK ? LIGHT : DARK);
	});

	/*
	 * Follow the system while the reader has not chosen for themselves. Once
	 * they have, their choice wins and this stops mattering.
	 */
	window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
		let stored = null;
		try {
			stored = localStorage.getItem(STORAGE_KEY);
		} catch {
			// Unreadable storage counts as no stored preference.
		}
		if (stored !== DARK && stored !== LIGHT) {
			document.documentElement.dataset.theme = event.matches ? LIGHT : DARK;
			paint(current());
		}
	});

	paint(current());
}
