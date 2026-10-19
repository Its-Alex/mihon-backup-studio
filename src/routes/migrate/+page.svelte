<script lang="ts">
	import { formatAge, groups, type EntryInsight } from '#lib/backup/analysis.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);

	const needing = $derived(
		analysis.entries
			.filter((entry) => entry.manga.favorite && (entry.extensionMissing || entry.frozenSource))
			.sort(
				(a, b) =>
					a.sourceName.localeCompare(b.sourceName) || a.manga.title.localeCompare(b.manga.title)
			)
	);

	const healthyByTitle = $derived.by(() => {
		const map = new Map<string, EntryInsight[]>();
		for (const entry of analysis.entries) {
			if (entry.extensionMissing || entry.frozenSource || !entry.normalizedTitle) continue;
			const list = map.get(entry.normalizedTitle) ?? [];
			list.push(entry);
			map.set(entry.normalizedTitle, list);
		}
		return map;
	});

	const candidatesFor = (entry: EntryInsight) =>
		(healthyByTitle.get(entry.normalizedTitle) ?? []).filter(
			(other) => other.manga.uid !== entry.manga.uid
		);

	const withCandidates = $derived(needing.filter((entry) => candidatesFor(entry).length > 0));

	let copied = $state(false);
	async function copyTitles() {
		const titles = [...new Set(needing.map((entry) => entry.manga.title))].join('\n');
		await navigator.clipboard.writeText(titles);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="page">
	<h1>Migrate</h1>
	<p class="muted" style="margin: 0">
		Library entries stuck on a frozen source or a missing extension. Migrating happens in Mihon itself (long-press an
		entry → Migrate, or search the title in another source); this page tells you which entries need it and whether the
		backup already holds a copy on a healthy source.
	</p>

	<div class="cards">
		<div class="panel card">
			<div class="value">{needing.length}</div>
			<div class="muted small">Entries to migrate</div>
		</div>
		<div class="panel card">
			<div class="value">{withCandidates.length}</div>
			<div class="muted small">Already have a copy on a healthy source</div>
		</div>
		<div class="panel card">
			<button onclick={copyTitles} disabled={!needing.length}>{copied ? 'Copied!' : 'Copy all titles'}</button>
			<div class="muted small">Paste them into Mihon's search, one by one</div>
		</div>
	</div>

	<div class="panel table-wrap" style="padding: 0">
		<table>
			<thead>
				<tr>
					<th>Title</th>
					<th>Source</th>
					<th>State</th>
					<th>Read</th>
					<th>Last read</th>
					<th>Copies on healthy sources</th>
				</tr>
			</thead>
			<tbody>
				{#each needing as entry (entry.manga.uid)}
					{@const candidates = candidatesFor(entry)}
					<tr>
						<td class="title">
							<button class="link" onclick={() => (studio.openEntryUid = entry.manga.uid)}>{entry.manga.title || '(untitled)'}</button>
						</td>
						<td class="small nowrap">{entry.sourceName}</td>
						<td>
							<span class="tag" title={groups[entry.group].hint}>
								<span class="dot" style:background={groups[entry.group].color}></span>
								{entry.extensionMissing ? 'Extension missing' : groups[entry.group].label}
							</span>
						</td>
						<td class="small nowrap">{entry.readCount} / {entry.chapterCount}</td>
						<td class="small nowrap">{formatAge(entry.lastRead, analysis.referenceTime)}</td>
						<td class="small">
							{#each candidates as candidate (candidate.manga.uid)}
								<button class="link candidate" onclick={() => (studio.openEntryUid = candidate.manga.uid)}>
									{candidate.sourceName} · {candidate.readCount}/{candidate.chapterCount} read
									{candidate.manga.favorite ? '· in library' : ''}
								</button>
							{:else}
								<span class="muted">—</span>
							{/each}
						</td>
					</tr>
				{:else}
					<tr><td colspan="6" class="muted">Nothing to migrate: every library entry sits on an installed, updating source.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

	.candidate {
		display: block;
	}
</style>
