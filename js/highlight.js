/*
 * Which genre the pointer is on. The donut and the legend both publish to it and
 * both listen, so hovering either one lights up the other.
 */

export function createHighlight() {
	let current = null;
	const listeners = new Set();

	return {
		get current() {
			return current;
		},
		set(name) {
			const next = name || null;
			if (next === current) {
				return;
			}
			current = next;
			for (const listener of listeners) {
				listener(current);
			}
		},
		subscribe(listener) {
			listeners.add(listener);
		}
	};
}
