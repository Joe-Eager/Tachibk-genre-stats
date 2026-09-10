/*
 * Wiring: load genreList.json, hold the filter state, and hand one view object
 * to each panel whenever that state changes.
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
	summary: document.getElementById('summary'),
	pieSub: document.getElementById('pieSub'),
	dial: document.getElementById('dial'),
	donut: document.getElementById('donut'),
	hub: document.getElementById('hub'),
	legend: document.getElementById('legend'),
	barSub: document.getElementById('barSub'),
	bars: document.getElementById('bars'),
	barMore: document.getElementById('barMore'),
	thead: document.getElementById('thead'),
	tbody: document.getElementById('tbody'),
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

let library = null;
let panels = null;
/*
 * Rebuilt alongside the panels: the donut and legend subscribe to it, so a fresh
 * one per load leaves no stale panel listening.
 */
let highlight = null;

function buildPanels() {
	return {
		donut: createDonut({
			dial: elements.dial,
			svg: elements.donut,
			hub: elements.hub,
			tooltip,
			highlight
		}),
		legend: createLegend({ list: elements.legend, tooltip, highlight }),
		bars: createBars({ container: elements.bars, moreButton: elements.barMore, tooltip, library }),
		table: createTable({ head: elements.thead, body: elements.tbody, library, state })
	};
}

function refresh() {
	const view = buildView(library, state);

	highlight.set(null);
	tooltip.hide();

	renderSummary(view);
	panels.donut.render(view);
	panels.legend.render(view);
	panels.bars.render(view);
	panels.table.render(view);
	renderCopy(view);
}

function renderSummary(view) {
	const { titlesInView, totalTags, ranked } = view.result;
	const pairs = [
		['Titles in view', formatCount(titlesInView)],
		['Genre tags', formatCount(totalTags)],
		['Distinct genres', formatCount(ranked.length)],
		['Tags per title', titlesInView ? (totalTags / titlesInView).toFixed(1) : '0']
	];

	clear(elements.summary);
	for (const [label, value] of pairs) {
		const group = document.createElement('div');
		group.append(element('dt', undefined, label), element('dd', undefined, value));
		elements.summary.appendChild(group);
	}
}

function renderCopy(view) {
	const { ranked, totalTags } = view.result;

	elements.pieSub.textContent =
		`The ${view.namedShown} most-tagged genres in the library, each keeping its own colour as you filter; ` +
		`everything else is pooled into ${OTHER_LABEL.toLowerCase()}. Hover or focus a slice for its title count.`;

	elements.barSub.textContent =
		`${formatCount(ranked.length)} genres appear in this selection, measured against the ` +
		`${formatCount(totalTags)} tag assignments in view.`;

	elements.noteFormat.textContent =
		(state.excludeFormat ? 'Format tags are being dropped: ' : 'Format tags are included: ') +
		library.formatNames.join(', ') +
		'. These describe how a title was published rather than what it is about, so they are off by default; ' +
		'the checkbox above puts them back.';

	elements.noteMerges.hidden = library.merges.length === 0;
	if (library.merges.length) {
		elements.noteMerges.textContent =
			'Sources spell some genres differently, and those spellings are counted as one genre under the ' +
			'most-used form: ' +
			library.merges.map((merge) => `${merge.variants.join(' and ')} as ${merge.name}`).join('; ') +
			'.';
	}

	const density = tagDensityBySource(library, state.excludeFormat);
	const densest = density[0];
	const rest = density.slice(1).filter((source) => source.titles > 0);
	const restAverage = rest.length ? rest.reduce((sum, source) => sum + source.perTitle, 0) / rest.length : 0;

	elements.noteSkew.textContent =
		densest && rest.length
			? `Sources tag at very different depths: ${densest.name} averages ${densest.perTitle.toFixed(1)} tags ` +
				`per title against about ${restAverage.toFixed(1)} everywhere else, so its fine-grained vocabulary ` +
				'inflates the long tail. Filter it out above to see the mix without it.'
			: '';
}

function adopt(nextLibrary) {
	library = nextLibrary;

	state.sources = new Set(library.sources.map((source) => source.index));
	highlight = createHighlight();
	panels = buildPanels();

	filters.mount();
	refresh();
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
			' or ',
			element('code', undefined, 'npx serve .'),
			'.'
		);
	}
}

function showReport(sourceLabel) {
	elements.intro.hidden = true;
	elements.introError.hidden = true;
	elements.report.hidden = false;
	elements.loadNote.dataset.kind = 'ok';
	// Genre counts are left to the summary strip, which states them per filter.
	elements.loadNote.textContent = `${sourceLabel}: ${formatCount(library.titles.length)} titles.`;
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

function setDragging(active) {
	elements.dropzone.hidden = !active;
}

window.addEventListener('dragenter', (event) => {
	if (!event.dataTransfer?.types.includes('Files')) {
		return;
	}
	event.preventDefault();
	dragDepth += 1;
	setDragging(true);
});

window.addEventListener('dragover', (event) => {
	if (event.dataTransfer?.types.includes('Files')) {
		event.preventDefault();
	}
});

window.addEventListener('dragleave', () => {
	dragDepth = Math.max(dragDepth - 1, 0);
	if (!dragDepth) {
		setDragging(false);
	}
});

window.addEventListener('drop', async (event) => {
	if (!event.dataTransfer?.files.length) {
		return;
	}
	event.preventDefault();
	dragDepth = 0;
	setDragging(false);
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
