<script lang="ts">
	import StackedBar from '#lib/components/StackedBar.svelte';
	import { formatAge, groups } from '#lib/backup/analysis.ts';
	import { groupSegments, libraryByCategory, libraryGroups } from '#lib/backup/views.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);
	const buckets = $derived(libraryByCategory(studio.document!, analysis.entries));
	let query = $state('');
	let expandAll = $state(false);

	const matches = (title: string) => !query || title.toLowerCase().includes(query.trim().toLowerCase());
</script>

<div class="page">
	<div class="row" style="justify-content: space-between">
		<h1>Library map</h1>
		<div class="row">
			<input placeholder="Search a title…" bind:value={query} />
			<button onclick={() => (expandAll = !expandAll)}>{expandAll ? 'Collapse all' : 'Expand all'}</button>
		</div>
	</div>
	<p class="muted small">
		↩ marks a last-read date recovered from another copy of the same title (left behind by a migration). Click a title to
		edit it.
	</p>

	{#each buckets as bucket (bucket.uid)}
		{@const visible = bucket.entries.filter((entry) => matches(entry.manga.title))}
		{#if visible.length}
			<section class="panel stack">
				<div class="row" style="justify-content: space-between">
					<h2>{bucket.name}</h2>
					<span class="muted">{query ? `${visible.length} / ` : ''}{bucket.entries.length}</span>
				</div>
				<StackedBar segments={groupSegments(bucket.entries)} />
				{#each libraryGroups as group (group)}
					{@const items = visible
						.filter((entry) => entry.group === group)
						.sort((a, b) => (b.lastRead ?? 0) - (a.lastRead ?? 0))}
					{#if items.length}
						<details open={expandAll || !!query}>
							<summary>
								<span class="dot" style:background={groups[group].color}></span>
								<strong>{groups[group].label}</strong>
								<span class="muted small">{groups[group].hint}</span>
								<span class="count muted">{items.length}</span>
							</summary>
							<div class="items">
								{#each items as entry (entry.manga.uid)}
									<div class="item">
										<button class="link title" title={entry.manga.title} onclick={() => (studio.openEntryUid = entry.manga.uid)}>
											{entry.manga.title}
										</button>
										<span class="progress" title="{entry.readCount} / {entry.chapterCount} chapters read">
											<i style:width="{entry.chapterCount ? (100 * entry.readCount) / entry.chapterCount : 0}%"></i>
										</span>
										<span class="muted small meta">
											{entry.readCount}/{entry.chapterCount} · read {formatAge(entry.lastRead, analysis.referenceTime)}{entry.lastReadRecovered
												? ' ↩'
												: ''} · new ch {formatAge(entry.lastUpload, analysis.referenceTime)} · {entry.sourceName}
										</span>
									</div>
								{/each}
							</div>
						</details>
					{/if}
				{/each}
			</section>
		{/if}
	{/each}
</div>

<style>
	details {
		background: var(--panel-2);
		border-radius: 8px;
	}

	summary {
		cursor: pointer;
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 8px 12px;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.count {
		margin-left: auto;
	}

	.items {
		padding: 0 12px 10px;
	}

	.item {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 80px 300px;
		gap: 10px;
		align-items: center;
		padding: 3px 0;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}

	.title:hover {
		color: var(--accent);
	}

	.progress {
		height: 5px;
		border-radius: 3px;
		background: var(--border);
		overflow: hidden;
	}

	.progress i {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.meta {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	@media (max-width: 760px) {
		.item {
			grid-template-columns: minmax(0, 1fr) 60px;
		}

		.meta {
			grid-column: 1 / 3;
		}
	}
</style>
