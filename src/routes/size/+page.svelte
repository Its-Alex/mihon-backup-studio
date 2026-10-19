<script lang="ts">
	import { resolve } from '$app/paths';
	import { buildSuggestions } from '#lib/backup/cleanup.ts';
	import { formatBytes, measureBackup, shareOf } from '#lib/backup/size.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);
	const breakdown = $derived.by(() => {
		void studio.version;
		return measureBackup(studio.document!);
	});
	const sizeByUid = $derived(new Map(breakdown.entries.map((entry) => [entry.uid, entry.total])));

	const composition = $derived(
		[
			{ key: 'library', label: 'Entries in the library', bytes: breakdown.libraryEntries, color: 'var(--c-blue)' },
			{ key: 'outside', label: 'Entries outside the library', bytes: breakdown.outsideEntries, color: 'var(--c-muted)' },
			{ key: 'appPreferences', label: 'App settings', bytes: breakdown.appPreferences, color: 'var(--c-teal)' },
			{ key: 'sourcePreferences', label: 'Source settings', bytes: breakdown.sourcePreferences, color: 'var(--c-purple)' },
			{ key: 'sources', label: 'Source list', bytes: breakdown.sources, color: 'var(--c-yellow)' },
			{ key: 'categories', label: 'Categories', bytes: breakdown.categories, color: 'var(--c-pink)' },
			{ key: 'other', label: 'Other (extension repos, unknown fields)', bytes: breakdown.other, color: 'var(--c-gray)' }
		].filter((segment) => segment.bytes > 0)
	);

	const insideEntries = $derived.by(() => {
		const entriesTotal = breakdown.libraryEntries + breakdown.outsideEntries;
		return {
			total: entriesTotal,
			segments: [
				{ key: 'chapters', label: 'Chapter lists', bytes: breakdown.chapters, color: 'var(--c-orange)' },
				{ key: 'history', label: 'Reading history', bytes: breakdown.history, color: 'var(--c-green)' },
				{ key: 'tracking', label: 'Tracker bindings', bytes: breakdown.tracking, color: 'var(--c-cyan)' },
				{ key: 'details', label: 'Details (title, description, genres, …)', bytes: breakdown.details, color: 'var(--c-blue)' }
			].filter((segment) => segment.bytes > 0)
		};
	});

	const savings = $derived.by(() => {
		const suggestions = buildSuggestions(analysis, { abandonedDays: 365, dailyCategoryUid: null });
		return suggestions
			.filter((suggestion) => suggestion.actions.includes('deleteFromBackup'))
			.map((suggestion) => ({
				id: suggestion.id,
				title: suggestion.title,
				count: suggestion.entries.length,
				bytes: suggestion.entries.reduce((sum, entry) => sum + (sizeByUid.get(entry.manga.uid) ?? 0), 0)
			}))
			.sort((a, b) => b.bytes - a.bytes);
	});

	const largest = $derived(breakdown.entries.slice(0, 25));

	const cards = $derived([
		{ label: 'Backup size (uncompressed)', value: formatBytes(breakdown.total) },
		{
			label: 'Entries',
			value: `${formatBytes(breakdown.libraryEntries + breakdown.outsideEntries)} · ${breakdown.entries.length}`
		},
		{ label: 'Chapter lists', value: formatBytes(breakdown.chapters) },
		{
			label: 'Largest entry',
			value: largest[0] ? `${formatBytes(largest[0].total)}` : '—'
		}
	]);
</script>

<div class="page">
	<h1>Size</h1>
	<p class="muted" style="margin: 0">
		What the backup's bytes are spent on, measured on the decoded data with your edits applied. The downloaded
		<code>.tachibk</code> is gzip-compressed, so the file itself is smaller.
	</p>

	<div class="cards">
		{#each cards as card (card.label)}
			<div class="panel card">
				<div class="value">{card.value}</div>
				<div class="muted small">{card.label}</div>
			</div>
		{/each}
	</div>

	<section class="panel stack">
		<h2>What's in the file</h2>
		<div class="bar">
			{#each composition as segment (segment.key)}
				<span
					class="segment"
					style:width={shareOf(segment.bytes, breakdown.total)}
					style:background={segment.color}
					title="{segment.label}: {formatBytes(segment.bytes)}"
				></span>
			{/each}
		</div>
		<div class="rows">
			{#each composition as segment (segment.key)}
				<div class="size-row">
					<span class="dot" style:background={segment.color}></span>
					<span class="label">{segment.label}</span>
					<span class="muted small">{formatBytes(segment.bytes)}</span>
					<span class="muted small share">{shareOf(segment.bytes, breakdown.total)}</span>
				</div>
			{/each}
		</div>
	</section>

	<section class="panel stack">
		<h2>Inside the entries</h2>
		<div class="bar">
			{#each insideEntries.segments as segment (segment.key)}
				<span
					class="segment"
					style:width={shareOf(segment.bytes, insideEntries.total)}
					style:background={segment.color}
					title="{segment.label}: {formatBytes(segment.bytes)}"
				></span>
			{/each}
		</div>
		<div class="rows">
			{#each insideEntries.segments as segment (segment.key)}
				<div class="size-row">
					<span class="dot" style:background={segment.color}></span>
					<span class="label">{segment.label}</span>
					<span class="muted small">{formatBytes(segment.bytes)}</span>
					<span class="muted small share">{shareOf(segment.bytes, insideEntries.total)}</span>
				</div>
			{/each}
		</div>
	</section>

	{#if savings.length}
		<section class="panel stack">
			<h2>What cleanup could free</h2>
			<p class="muted small" style="margin: 0">
				Size only drops when entries are deleted from the backup; removing from the library or moving categories keeps
				their bytes. Review and apply these on the <a href={resolve('/cleanup')}>Cleanup</a> page.
			</p>
			<table>
				<tbody>
					{#each savings as item (item.id)}
						<tr>
							<td>{item.title}</td>
							<td class="small muted">{item.count} {item.count === 1 ? 'entry' : 'entries'}</td>
							<td class="small nowrap" style="text-align: right">{formatBytes(item.bytes)}</td>
							<td class="small muted nowrap" style="text-align: right">{shareOf(item.bytes, breakdown.total)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<section class="panel table-wrap" style="padding: 0">
		<table>
			<thead>
				<tr>
					<th>Largest entries</th>
					<th>Library</th>
					<th>Chapters</th>
					<th>History</th>
					<th>Details</th>
					<th>Total</th>
					<th>Share</th>
				</tr>
			</thead>
			<tbody>
				{#each largest as entry (entry.uid)}
					<tr>
						<td class="title">
							<button class="link" onclick={() => (studio.openEntryUid = entry.uid)}>{entry.title || '(untitled)'}</button>
						</td>
						<td class="small">{entry.inLibrary ? 'yes' : '—'}</td>
						<td class="small nowrap">{formatBytes(entry.chapters)} · {entry.chapterCount} ch</td>
						<td class="small nowrap">{formatBytes(entry.history)}</td>
						<td class="small nowrap">{formatBytes(entry.details + entry.tracking)}</td>
						<td class="small nowrap">{formatBytes(entry.total)}</td>
						<td class="small muted nowrap">{shareOf(entry.total, breakdown.total)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 12px;
	}

	.value {
		font-size: 24px;
		font-weight: 700;
	}

	.bar {
		display: flex;
		height: 14px;
		border-radius: 7px;
		overflow: hidden;
		background: var(--panel-2);
	}

	.segment {
		min-width: 2px;
	}

	.rows {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.size-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto 52px;
		gap: 10px;
		align-items: center;
	}

	.size-row .label {
		font-size: 13px;
	}

	.share {
		text-align: right;
	}

	.title {
		max-width: 360px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
