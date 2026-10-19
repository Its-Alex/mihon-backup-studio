<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import StackedBar from '#lib/components/StackedBar.svelte';
	import { DAY, formatAge, groups } from '#lib/backup/analysis.ts';
	import { MangaStatus } from '#lib/backup/model.ts';
	import { genreStats, groupSegments, libraryByCategory, libraryGroups } from '#lib/backup/views.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);
	const document = $derived.by(() => {
		void studio.version;
		return studio.document!;
	});
	const library = $derived(analysis.entries.filter((entry) => entry.manga.favorite));
	const buckets = $derived(libraryByCategory(document, analysis.entries));

	const cards = $derived([
		{ label: 'Library entries', value: library.length },
		{ label: 'Outside the library', value: analysis.entries.length - library.length },
		{ label: 'Categories', value: document.categories.length },
		{ label: 'Chapters read (library)', value: library.reduce((sum, entry) => sum + entry.readCount, 0).toLocaleString() },
		{
			label: 'Hours read (recorded)',
			value: Math.round(analysis.entries.reduce((sum, entry) => sum + entry.readDuration, 0) / 3_600_000).toLocaleString()
		},
		{ label: 'Sources', value: analysis.sources.length }
	]);

	const activityMonths = 24;
	const activity = $derived.by(() => {
		const counts = Array.from({ length: activityMonths }, () => 0);
		let older = 0;
		let unknown = 0;
		const reference = new Date(analysis.referenceTime);
		for (const entry of library) {
			if (!entry.lastRead) {
				unknown++;
				continue;
			}
			const date = new Date(entry.lastRead);
			const monthsAgo = (reference.getFullYear() - date.getFullYear()) * 12 + reference.getMonth() - date.getMonth();
			if (monthsAgo < activityMonths) counts[activityMonths - 1 - monthsAgo]++;
			else older++;
		}
		const labels = counts.map((_, index) => {
			const date = new Date(reference.getFullYear(), reference.getMonth() - (activityMonths - 1 - index), 1);
			return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
		});
		return { counts, labels, older, unknown, max: Math.max(1, ...counts) };
	});

	const topReadTime = $derived.by(() => {
		const byTitle = new Map<string, { uid: string; title: string; duration: number; inLibrary: boolean }>();
		for (const entry of analysis.entries) {
			const current = byTitle.get(entry.normalizedTitle);
			const duration = (current?.duration ?? 0) + entry.readDuration;
			const preferThis = !current || (entry.manga.favorite && !current.inLibrary);
			byTitle.set(entry.normalizedTitle, {
				uid: preferThis ? entry.manga.uid : current.uid,
				title: preferThis ? entry.manga.title : current.title,
				inLibrary: preferThis ? entry.manga.favorite : current.inLibrary,
				duration
			});
		}
		return [...byTitle.values()]
			.filter((item) => item.duration > 0)
			.sort((a, b) => b.duration - a.duration)
			.slice(0, 10);
	});

	const genreTop = $derived(genreStats(library).slice(0, 20));
	const statusCounts = $derived(
		Object.entries(MangaStatus)
			.map(([value, label]) => ({
				value,
				label,
				count: library.filter((entry) => entry.manga.status === Number(value)).length
			}))
			.filter((item) => item.count > 0)
			.sort((a, b) => b.count - a.count)
	);

	const openEntries = (params: Record<string, string>) =>
		goto(`${resolve('/entries')}?${new URLSearchParams(params)}`);
</script>

<div class="page">
	<div class="row" style="justify-content: space-between">
		<h1>Dashboard</h1>
		<span class="muted small">
			Ages are measured from the newest activity in the backup: {new Date(analysis.referenceTime).toLocaleDateString()}
		</span>
	</div>

	<div class="cards">
		{#each cards as card (card.label)}
			<div class="panel card">
				<div class="value">{card.value}</div>
				<div class="muted small">{card.label}</div>
			</div>
		{/each}
	</div>

	<section class="panel stack">
		<h2>Library by category</h2>
		{#each buckets as bucket (bucket.uid)}
			<div class="stack" style="gap: 4px">
				<div class="row" style="justify-content: space-between">
					<button class="link" onclick={() => openEntries({ category: bucket.uid, library: 'in' })}>{bucket.name}</button>
					<span class="muted">{bucket.entries.length}</span>
				</div>
				<StackedBar
					segments={groupSegments(bucket.entries)}
					onselect={(group) => openEntries({ category: bucket.uid, group, library: 'in' })}
				/>
			</div>
		{/each}
		<div class="legend">
			{#each libraryGroups as group (group)}
				<button class="link legend-item" onclick={() => openEntries({ group, library: 'in' })} title={groups[group].hint}>
					<span class="dot" style:background={groups[group].color}></span>
					{groups[group].label}
					<span class="muted">{library.filter((entry) => entry.group === group).length}</span>
				</button>
			{/each}
		</div>
	</section>

	<div class="two">
		<section class="panel stack">
			<h2>Last read, per month (library)</h2>
			<svg viewBox="0 0 {activityMonths * 20} 130" class="chart" role="img" aria-label="Entries by month of last read">
				{#each activity.counts as count, index (index)}
					{@const height = (count / activity.max) * 100}
					<rect x={index * 20 + 3} y={105 - height} width="14" height={height} rx="2" fill="var(--accent)">
						<title>{activity.labels[index]}: {count}</title>
					</rect>
					{#if index % 3 === 0}
						<text x={index * 20 + 10} y="122" text-anchor="middle" class="axis">{activity.labels[index]}</text>
					{/if}
				{/each}
			</svg>
			<div class="muted small">
				Older than {activityMonths} months: {activity.older} · unknown (no history anywhere): {activity.unknown}
			</div>
		</section>

		<section class="panel stack">
			<h2>Most time spent reading</h2>
			<p class="muted small" style="margin: 0">All copies of a title added together.</p>
			<table>
				<tbody>
					{#each topReadTime as item (item.uid)}
						<tr>
							<td><button class="link" onclick={() => (studio.openEntryUid = item.uid)}>{item.title}</button></td>
							<td class="muted small" style="text-align: right">{(item.duration / 3_600_000).toFixed(1)} h</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>

	<div class="two">
		<section class="panel stack">
			<h2>Top genres (library)</h2>
			<div class="bars">
				{#each genreTop as item (item.key)}
					<button class="link bar-row" onclick={() => openEntries({ genre: item.key, library: 'in' })}>
						<span class="bar-label">{item.label}</span>
						<span class="bar-track"><span class="bar" style:width="{(item.count / (genreTop[0]?.count || 1)) * 100}%"></span></span>
						<span class="muted small">{item.count}</span>
					</button>
				{:else}
					<p class="muted small">No genre information in this backup.</p>
				{/each}
			</div>
		</section>

		<section class="panel stack">
			<h2>Publication status (library)</h2>
			<div class="bars">
				{#each statusCounts as item (item.value)}
					<button class="link bar-row" onclick={() => openEntries({ status: item.value, library: 'in' })}>
						<span class="bar-label">{item.label}</span>
						<span class="bar-track"><span class="bar" style:width="{(item.count / (statusCounts[0]?.count || 1)) * 100}%"></span></span>
						<span class="muted small">{item.count}</span>
					</button>
				{/each}
			</div>
		</section>
	</div>

	<section class="panel stack">
		<div class="row" style="justify-content: space-between">
			<h2>Sources</h2>
			<a href={resolve('/settings')} class="small">Adjust frozen-source detection</a>
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Source</th>
						<th>In library</th>
						<th>All entries</th>
						<th>Median age of newest chapter</th>
						<th>Status</th>
					</tr>
				</thead>
				<tbody>
					{#each analysis.sources as source (source.key)}
						<tr>
							<td><button class="link" onclick={() => openEntries({ source: source.key })}>{source.name}</button></td>
							<td>{source.libraryCount}</td>
							<td>{source.entryCount}</td>
							<td>
								{source.medianDaysSinceUpload === null
									? '—'
									: formatAge(analysis.referenceTime - source.medianDaysSinceUpload * DAY, analysis.referenceTime)}
							</td>
							<td>
								{#if !source.installed}
									<span class="tag">Extension missing</span>
								{:else if source.frozen}
									<span class="tag" style="color: var(--danger)">Frozen</span>
								{:else}
									<span class="tag">Updating</span>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
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

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text);
		font-size: 12px;
	}

	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 16px;
	}

	.chart {
		width: 100%;
		height: auto;
	}

	.axis {
		font-size: 9px;
		fill: var(--muted);
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.bar-row {
		display: grid;
		grid-template-columns: 150px 1fr 36px;
		gap: 10px;
		align-items: center;
		color: var(--text);
	}

	.bar-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 12px;
	}

	.bar-track {
		background: var(--panel-2);
		border-radius: 4px;
		height: 10px;
		overflow: hidden;
	}

	.bar {
		display: block;
		height: 100%;
		background: var(--accent);
		border-radius: 4px;
	}
</style>
