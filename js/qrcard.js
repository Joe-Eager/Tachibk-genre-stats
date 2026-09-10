/*
 * The share card: a QR code and a copyable link to the published site.
 *
 * Every hook here is named qr-* rather than share-*. Content blockers carry
 * generic element-hiding rules for share widgets, and #shareButton and #shareUrl
 * are both in Fanboy's Social list verbatim, which hid the button outright. The
 * wording stays "Share" because no generic rule matches on text.
 *
 * The URL is the canonical published address rather than location.href, so a
 * link shared from a local copy still points somewhere useful.
 *
 * Built on <dialog>, which brings the backdrop, Escape to close and focus
 * containment without any of it being hand-rolled.
 */

const SITE_URL = 'https://cheese-greater.github.io/Tachibk-genre-stats/';
const COPIED_FOR = 1600;

export function createQrCard({ button, dialog, closeButton, urlLabel, copyButton }) {
	let resetTimer = 0;

	urlLabel.textContent = SITE_URL;

	button.addEventListener('click', () => {
		resetCopyLabel();
		dialog.showModal();
	});

	closeButton.addEventListener('click', () => dialog.close());

	// Clicking the backdrop closes it; clicking the panel must not.
	dialog.addEventListener('click', (event) => {
		if (event.target === dialog) {
			dialog.close();
		}
	});

	copyButton.addEventListener('click', async () => {
		try {
			await copyToClipboard(SITE_URL);
			flash('Copied');
		} catch {
			// Clipboard access needs a secure context and can be refused outright,
			// so fall back to selecting the text for the reader to copy.
			selectText(urlLabel);
			flash('Press Ctrl+C');
		}
	});

	function flash(message) {
		copyButton.textContent = message;
		window.clearTimeout(resetTimer);
		resetTimer = window.setTimeout(resetCopyLabel, COPIED_FOR);
	}

	function resetCopyLabel() {
		window.clearTimeout(resetTimer);
		copyButton.textContent = 'Copy';
	}
}

async function copyToClipboard(text) {
	if (!navigator.clipboard?.writeText) {
		throw new Error('no clipboard access');
	}
	await navigator.clipboard.writeText(text);
}

function selectText(node) {
	const range = document.createRange();
	range.selectNodeContents(node);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
}
