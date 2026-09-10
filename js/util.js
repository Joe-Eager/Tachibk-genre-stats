/* Formatting and small DOM helpers shared by every view. */

const SVG_NS = 'http://www.w3.org/2000/svg';

export function formatCount(value) {
	return value.toLocaleString('en-US');
}

export function formatPercent(part, whole, digits = 1) {
	if (!whole) {
		return '0%';
	}
	return ((part / whole) * 100).toFixed(digits) + '%';
}

/*
 * Genre and title names come from a scraped backup file, so they are always
 * inserted as text and never as markup.
 */
export function element(tag, className, text) {
	const node = document.createElement(tag);
	if (className) {
		node.className = className;
	}
	if (text !== undefined) {
		node.textContent = text;
	}
	return node;
}

export function svgElement(tag, attributes = {}) {
	const node = document.createElementNS(SVG_NS, tag);
	for (const [name, value] of Object.entries(attributes)) {
		node.setAttribute(name, value);
	}
	return node;
}

export function clear(node) {
	node.replaceChildren();
}

export function slotColor(slot) {
	return slot === null || slot === undefined ? 'var(--series-other)' : `var(--series-${slot + 1})`;
}

export function slotLabelInk(slot) {
	return slot === null || slot === undefined ? 'var(--label-on-other)' : `var(--label-on-${slot + 1})`;
}
