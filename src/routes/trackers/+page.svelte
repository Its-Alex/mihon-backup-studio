<script lang="ts">
	import { formatAge } from '#lib/backup/analysis.ts';
	import {
		buildLibraryCsv,
		buildMalXml,
		malExportItems,
		maxReadChapterNumber,
		trackerName,
		trackingProgress
	} from '#lib/backup/trackers.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);
	const library = $derived(analysis.entries.filter((entry) => entry.manga.favorite));
	const tracked = $derived(library.filter((entry) => entry.manga.tracking.length > 0));
	const untracked = $derived(library.filter((entry) => entry.manga.tracking.length === 0));

	const byService = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const entry of tracked) {
			for (const tracking of entry.manga.tracking)
				counts.set(tracking.syncId, (counts.get(tracking.syncId) ?? 0) + 1);
		}
		return [...counts].sort((a, b) => b[1] - a[1]);
	});

	const malItems = $derived(malExportItems(library));

	function downloadText(content: string, name: string, type: string) {
		const url = URL.createObjectURL(new Blob([content], { type }));
		const link = document.createElement('a');
		link.href = url;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	}

	const downloadMalXml = () =>
		downloadText(buildMalXml(malItems), 'mihon_mal_export.xml', 'application/xml');
	const downloadUntrackedCsv = () =>
		downloadText(buildLibraryCsv(untracked), 'mihon_untracked_library.csv', 'text/csv');
</script>

<div class="page">
	<h1>Trackers</h1>

	<div class="cards">
		<div class="panel card">
			<div class="value">{library.length}</div>
			<div class="muted small">Library entries</div>
		</div>
		<div class="panel card">
			<div class="value">{tracked.length}</div>
			<div class="muted small">Bound to a tracker</div>
		</div>
		<div class="panel card">
			<div class="value">{untracked.length}</div>
			<div class="muted small">Not tracked</div>
		</div>
	</div>

	{#if byService.length}
		<div class="row">
			{#each byService as [syncId, count] (syncId)}
				<span class="tag">{trackerName(syncId)} · {count}</span>
			{/each}
		</div>
	{/if}

	<section class="panel stack">
		<h2>MyAnimeList export</h2>
		<p class="muted small" style="margin: 0">
			A MAL import XML (also accepted by AniList's importer) built from the {malItems.length} library
			{malItems.length === 1 ? 'entry' : 'entries'} bound to MyAnimeList. Chapters read come from whichever is further:
			the tracker or the backup's own read chapters. MAL can only match entries by its own database id, so untracked
			entries cannot be included — export them as CSV below to match them by hand.
		</p>
		<div class="row">
			<button class="primary" disabled={!malItems.length} onclick={downloadMalXml}>
				Download MAL XML ({malItems.length})
			</button>
			<button disabled={!untracked.length} onclick={downloadUntrackedCsv}>
				Download untracked library as CSV ({untracked.length})
			</button>
		</div>
	</section>

	<section class="panel table-wrap" style="padding: 0">
		<table>
			<thead>
				<tr>
					<th>Title</th>
					<th>Tracker</th>
					<th>Tracker progress</th>
					<th>Backup progress</th>
					<th>Score</th>
					<th>Last read</th>
					<th>Link</th>
				</tr>
			</thead>
			<tbody>
				{#each tracked as entry (entry.manga.uid)}
					{#each entry.manga.tracking as tracking, index (index)}
						<tr>
							<td class="title">
								{#if index === 0}
									<button class="link" onclick={() => (studio.openEntryUid = entry.manga.uid)}>{entry.manga.title || '(untitled)'}</button>
								{/if}
							</td>
							<td class="small nowrap">{trackerName(tracking.syncId)}</td>
							<td class="small nowrap">{trackingProgress(tracking)}</td>
							<td class="small nowrap">{maxReadChapterNumber(entry.manga) || entry.readCount} / {entry.chapterCount}</td>
							<td class="small nowrap">{tracking.score || '—'}</td>
							<td class="small nowrap">{formatAge(entry.lastRead, analysis.referenceTime)}</td>
							<td class="small">
								{#if tracking.trackingUrl}
									<a href={tracking.trackingUrl} target="_blank" rel="noreferrer">open</a>
								{:else}
									—
								{/if}
							</td>
						</tr>
					{/each}
				{:else}
					<tr><td colspan="7" class="muted">No library entry is bound to a tracker in this backup.</td></tr>
				{/each}
			</tbody>
		</table>
	</section>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 12px;
	}

	.value {
		font-size: 24px;
		font-weight: 700;
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
