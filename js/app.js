/*
 * Wiring: take a backup from the visitor, hold the filter state, and hand one
 * view object to each panel whenever that state changes.
 */

import { buildLibrary, buildView, OTHER_LABEL, tagDensityBySource } from './data.js';
import { fetchBackup, readBackupFile } from './backup.js';
import { clear, element, formatCount } from './util.js';
import { createTooltip } from './tooltip.js';
import { createHighlight } from './highlight.js';
import { createDonut } from './donut.js';
import { createLegend } from './legend.js';
import { createBars } from './bars.js';
import { createTable } from './table.js';
import { createFilters } from './filters.js';
import { createStats } from './stats.js';
import { createTitles } from './titles.js';
import { createQrCard } from './qrcard.js';
import { createTheme } from './theme.js';

/*
 * The visitor brings the backup: nothing is loaded from the server unless
 * ?data=<url> asks for it, which is there for anyone hosting their own copy
 * alongside a backup they are happy to serve publicly.
 */

const elements = {
	intro: document.getElementById('intro'),
	introError: document.getElementById('introError'),
	report: document.getElementById('report'),
	sourceChips: document.getElementById('sourceChips'),
	sourceLabel: document.getElementById('sourceLabel'),
	sourceReset: document.getElementById('sourceReset'),
	sliceSeg: document.getElementById('sliceSeg'),
	excludeFormat: document.getElementById('excludeFormat'),
	fileInput: document.getElementById('fileInput'),
	loadNote: document.getElementById('loadNote'),
	dropzone: document.getElementById('dropzone'),
	tiles: document.getElementById('tiles'),
	pieSub: document.getElementById('pieSub'),
	dial: document.getElementById('dial'),
	donut: document.getElementById('donut'),
	hub: document.getElementById('hub'),
	legend: document.getElementById('legend'),
	progressPanel: document.getElementById('progressPanel'),
	progressBar: document.getElementById('progressBar'),
	progressLegend: document.getElementById('progressLegend'),
	statusPanel: document.getElementById('statusPanel'),
	statusBars: document.getElementById('statusBars'),
	titlesPanel: document.getElementById('titlesPanel'),
	titleList: document.getElementById('titleList'),
	titleSeg: document.getElementById('titleSeg'),
	barSub: document.getElementById('barSub'),
	bars: document.getElementById('bars'),
	barMore: document.getElementById('barMore'),
	thead: document.getElementById('thead'),
	tbody: document.getElementById('tbody'),
	noteMissing: document.getElementById('noteMissing'),
	noteFormat: document.getElementById('noteFormat'),
	noteMerges: document.getElementById('noteMerges'),
	noteSkew: document.getElementById('noteSkew'),
	tip: document.getElementById('tip')
};

const state = {
	sources: new Set(),
	sliceCount: 6,
	excludeFormat: true
};

const tooltip = createTooltip(elements.tip);
const filters = createFilters({ elements, state, getLibrary: () => library, onChange: refresh });

// Both are independent of the loaded data, so they are wired once and are
// available whether or not a backup has been opened.
createTheme({
	button: document.getElementById('themeToggle'),
	icon: document.getElementById('themeIcon')
});

createQrCard({
	button: document.getElementById('qrButton'),
	dialog: document.getElementById('qrDialog'),
	closeButton: document.getElementById('qrClose'),
	urlLabel: document.getElementById('qrUrl'),
	copyButton: document.getElementById('qrCopy')
});

let library = null;
let panels = null;
/*
 * Rebuilt alongside the panels: the donut and legend subscribe to it, so a fresh
 * one per load leaves no stale panel listening.
 */
let highlight = null;

function buildPanels() {
	return {
		stats: createStats({
			tiles: elements.tiles,
			progressPanel: elements.progressPanel,
			progressBar: elements.progressBar,
			progressLegend: elements.progressLegend,
			statusPanel: elements.statusPanel,
			statusBars: elements.statusBars
		}),
		donut: createDonut({
			dial: elements.dial,
			svg: elements.donut,
			hub: elements.hub,
			tooltip,
			highlight
		}),
		legend: createLegend({ list: elements.legend, tooltip, highlight }),
		titles: createTitles({ panel: elements.titlesPanel, list: elements.titleList, segment: elements.titleSeg }),
		bars: createBars({ container: elements.bars, moreButton: elements.barMore, tooltip, library }),
		table: createTable({ head: elements.thead, body: elements.tbody, library, state })
	};
}

function refresh() {
	const view = buildView(library, state);

	highlight.set(null);
	tooltip.hide();

	panels.stats.render(view, library);
	panels.donut.render(view);
	panels.legend.render(view);
	panels.titles.render(view, library);
	panels.bars.render(view);
	panels.table.render(view);
	renderCopy(view);
}

/* Anything the backup omits is named once, so a hidden panel is never silent. */
const OPTIONAL_DATA = [
	['chapters', 'chapter counts'],
	['readState', 'reading progress'],
	['history', 'reading time'],
	['status', 'publication status'],
	['genres', 'genres']
];

function renderCopy(view) {
	const { ranked, totalTags } = view.result;

	const missing = OPTIONAL_DATA.filter(([key]) => !library.available[key]).map(([, label]) => label);
	elements.noteMissing.hidden = missing.length === 0;
	elements.noteMissing.textContent = `Not in this backup: ${missing.join(', ')}.`;

	elements.pieSub.textContent = `Top ${view.namedShown} genres; the rest pooled. Slices are shares of the ${formatCount(totalTags)} tags in view.`;
	elements.barSub.textContent = `${formatCount(ranked.length)} genres in this selection.`;

	elements.noteFormat.textContent = state.excludeFormat
		? `Format tags dropped: ${library.formatNames.join(', ')}.`
		: `Format tags included: ${library.formatNames.join(', ')}.`;
	elements.noteFormat.hidden = library.formatNames.length === 0;

	elements.noteMerges.hidden = library.merges.length === 0;
	if (library.merges.length) {
		// A large library can carry a dozen of these; name a few, count the rest.
		const shown = library.merges.slice(0, 3).map((merge) => merge.name);
		const extra = library.merges.length - shown.length;
		elements.noteMerges.textContent =
			`${library.merges.length} genre${library.merges.length === 1 ? '' : 's'} spelled more than one way, ` +
			`counted once under the commonest spelling: ${shown.join(', ')}${extra ? ` and ${extra} more` : ''}.`;
	}

	const density = tagDensityBySource(library, state.excludeFormat);
	const densest = density[0];
	const rest = density.slice(1).filter((source) => source.titles > 0);
	const restAverage = rest.length ? rest.reduce((sum, source) => sum + source.perTitle, 0) / rest.length : 0;

	// Only worth saying when one source really is skewing the tail.
	const skewed = densest && rest.length && densest.perTitle > restAverage * 1.8;
	elements.noteSkew.hidden = !skewed;
	if (skewed) {
		elements.noteSkew.textContent =
			`${densest.name} tags ${densest.perTitle.toFixed(1)} genres per title against ` +
			`${restAverage.toFixed(1)} elsewhere, which inflates the tail.`;
	}
}

/* Nothing is charted yet: the landing pane asks for a file. */
function showLanding(error) {
	elements.report.hidden = true;
	elements.intro.hidden = false;
	elements.introError.hidden = !error;

	if (!error) {
		return;
	}

	clear(elements.introError);
	elements.introError.append(element('b', undefined, 'That file did not load. '), error.message);

	if (error.needsServer) {
		elements.introError.append(
			' Serve the folder rather than opening the file directly: ',
			element('code', undefined, 'python -m http.server 8000'),
			'.'
		);
	}
}

function showReport(sourceLabel) {
	elements.intro.hidden = true;
	elements.introError.hidden = true;
	elements.report.hidden = false;
	elements.loadNote.dataset.kind = 'ok';
	elements.loadNote.textContent = sourceLabel;
}

function adopt(nextLibrary) {
	library = nextLibrary;

	state.sources = new Set(library.sources.map((source) => source.index));
	highlight = createHighlight();
	panels = buildPanels();

	filters.mount();
	refresh();
}

async function openFile(file) {
	try {
		adopt(buildLibrary(await readBackupFile(file)));
		showReport(file.name);
	} catch (error) {
		// A bad file while a library is already charted must not throw that away.
		if (library) {
			elements.loadNote.dataset.kind = 'error';
			elements.loadNote.textContent = error.message;
		} else {
			showLanding(error);
		}
	}
}

elements.fileInput.addEventListener('change', async (event) => {
	const [file] = event.target.files || [];
	if (file) {
		await openFile(file);
	}
	elements.fileInput.value = '';
});

/*
 * Dragging over a page fires dragleave for every child boundary crossed, so the
 * overlay is held open by a depth count rather than by the last event seen.
 */
let dragDepth = 0;

window.addEventListener('dragenter', (event) => {
	if (!event.dataTransfer?.types.includes('Files')) {
		return;
	}
	event.preventDefault();
	dragDepth += 1;
	elements.dropzone.hidden = false;
});

window.addEventListener('dragover', (event) => {
	if (event.dataTransfer?.types.includes('Files')) {
		event.preventDefault();
	}
});

window.addEventListener('dragleave', () => {
	dragDepth = Math.max(dragDepth - 1, 0);
	if (!dragDepth) {
		elements.dropzone.hidden = true;
	}
});

window.addEventListener('drop', async (event) => {
	if (!event.dataTransfer?.files.length) {
		return;
	}
	event.preventDefault();
	dragDepth = 0;
	elements.dropzone.hidden = true;
	await openFile(event.dataTransfer.files[0]);
});

const requestedUrl = new URL(location.href).searchParams.get('data');

if (requestedUrl) {
	try {
		adopt(buildLibrary(await fetchBackup(requestedUrl)));
		showReport(requestedUrl.replace(/^\.?\//, ''));
	} catch (error) {
		showLanding(error);
	}
} else {
	showLanding();
}
