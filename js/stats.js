/*
 * The library's non-genre numbers: headline tiles, reading progress and
 * publication status.
 *
 * Backups differ in what they carry, so every tile can report that a figure is
 * absent rather than printing a zero that looks like a real total.
 */

import { clear, element, formatCount, formatPercent } from './util.js';

/* Reading progress is an ordered scale, so it wears one hue light to dark. */
const PROGRESS_STEPS = [
	{ key: 'finished', label: 'Finished', color: 'var(--ordinal-3)' },
	{ key: 'started', label: 'In progress', color: 'var(--ordinal-2)' },
	{ key: 'unread', label: 'Not started', color: 'var(--ordinal-1)' },
	{ key: 'unknown', label: 'No chapters', color: 'var(--series-other)' }
];

export function formatDuration(milliseconds) {
	if (milliseconds === null) {
		return null;
	}
	const minutes = milliseconds / 60000;
	if (minutes < 1) {
		return 'under a minute';
	}
	if (minutes < 90) {
		return `${Math.round(minutes)} min`;
	}
	const hours = minutes / 60;
	if (hours < 10) {
		return `${hours.toFixed(1)} h`;
	}
	return `${formatCount(Math.round(hours))} h`;
}

export function createStats({ tiles, progressPanel, progressBar, progressLegend, statusPanel, statusBars }) {
	function render(view, library) {
		renderTiles(view, library);
		renderProgress(view, library);
		renderStatuses(view, library);
	}

	function renderTiles(view, library) {
		const { stats, result } = view;
		const { available } = library;

		const rows = [
			{ label: 'Titles', value: formatCount(stats.titles) },
			{
				label: 'Chapters',
				value: available.chapters ? formatCount(stats.chapters) : null
			},
			{
				label: 'Chapters read',
				value: available.readState ? formatCount(stats.chaptersRead) : null,
				note: available.readState && stats.chapters ? `${formatPercent(stats.chaptersRead, stats.chapters)} of them` : null
			},
			{
				label: 'Time read',
				value: available.history ? formatDuration(stats.readDurationMs) : null,
				note: available.history ? `${formatCount(stats.historyRows)} chapters logged` : null
			},
			{ label: 'Genre tags', value: formatCount(result.totalTags) },
			{ label: 'Distinct genres', value: formatCount(result.ranked.length) }
		];

		clear(tiles);
		for (const row of rows) {
			const tile = element('div', 'tile');
			tile.appendChild(element('span', 'tile-label', row.label));
			// A missing figure is shown as a placeholder and named, never as zero.
			tile.appendChild(element('span', row.value === null ? 'tile-value is-absent' : 'tile-value', row.value ?? '--'));
			tile.appendChild(element('span', 'tile-note', row.value === null ? 'not in this backup' : row.note ?? ''));
			tiles.appendChild(tile);
		}
	}

	function renderProgress(view, library) {
		if (!library.available.readState) {
			progressPanel.hidden = true;
			return;
		}
		progressPanel.hidden = false;

		const { progress, titles } = view.stats;
		const segments = PROGRESS_STEPS.map((step) => ({ ...step, count: progress[step.key] })).filter(
			(step) => step.count > 0
		);

		clear(progressBar);
		for (const segment of segments) {
			const fill = element('span', 'stack-segment');
			fill.style.background = segment.color;
			fill.style.flexGrow = String(segment.count);
			fill.title = `${segment.label}: ${formatCount(segment.count)}`;
			progressBar.appendChild(fill);
		}

		clear(progressLegend);
		for (const segment of segments) {
			const item = element('li');
			const swatch = element('span', 'swatch');
			swatch.style.background = segment.color;
			item.append(
				swatch,
				element('span', 'name', segment.label),
				element('span', 'share', formatPercent(segment.count, titles)),
				element('span', 'titles', `${formatCount(segment.count)} titles`)
			);
			progressLegend.appendChild(item);
		}
	}

	function renderStatuses(view, library) {
		if (!library.available.status) {
			statusPanel.hidden = true;
			return;
		}
		statusPanel.hidden = false;

		const { statuses, titles } = view.stats;
		const largest = statuses.reduce((max, row) => Math.max(max, row.count), 0);

		clear(statusBars);
		for (const row of statuses) {
			const line = element('div', 'bar-row');
			const track = element('span', 'track');
			const fill = element('span', 'fill');
			fill.style.width = `${Math.max((row.count / largest) * 100, 0.6)}%`;
			// One series, so one colour; the length already carries the value.
			if (row.status === null) {
				fill.style.background = 'var(--series-other)';
			}
			track.appendChild(fill);

			line.append(
				element('span', 'cat', row.name),
				track,
				element('span', 'val', formatPercent(row.count, titles))
			);
			statusBars.appendChild(line);
		}
	}

	return { render };
}
