<script lang="ts">
	import { page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import NewEntryDialog from '#lib/components/NewEntryDialog.svelte';
	import { formatAge, groups, type EntryInsight, type Group } from '#lib/backup/analysis.ts';
	import { MangaStatus } from '#lib/backup/model.ts';
	import { DEFAULT_CATEGORY, genreStats, hasGenre } from '#lib/backup/views.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const pageSize = 100;
	const sorters: Record<string, { label: string; compare: (a: EntryInsight, b: EntryInsight) => number }> = {
		lastRead: { label: 'Last read', compare: (a, b) => (b.lastRead ?? 0) - (a.lastRead ?? 0) },
		title: { label: 'Title', compare: (a, b) => a.manga.title.localeCompare(b.manga.title) },
		unread: { label: 'Unread chapters', compare: (a, b) => b.unreadCount - a.unreadCount },
		read: { label: 'Chapters read', compare: (a, b) => b.readCount - a.readCount },
		lastUpload: { label: 'Newest chapter', compare: (a, b) => (b.lastUpload ?? 0) - (a.lastUpload ?? 0) },
		added: { label: 'Date added', compare: (a, b) => b.manga.dateAdded - a.manga.dateAdded }
	};

	let query = $state('');
	let library = $state('in');
	let category = $state('all');
	let group = $state('all');
	let source = $state('all');
	let genre = $state('all');
	let status = $state('all');
	let sortBy = $state('lastRead');
	let pageIndex = $state(0);
	let targetCategory = $state('');
	let creating = $state(false);
	const selected = new SvelteSet<string>();

	$effect(() => {
		const params = page.url.searchParams;
		query = params.get('q') ?? '';
		library = params.get('library') ?? (params.has('source') ? 'all' : 'in');
		category = params.get('category') ?? 'all';
		group = params.get('group') ?? 'all';
		source = params.get('source') ?? 'all';
		genre = params.get('genre') ?? 'all';
		status = params.get('status') ?? 'all';
		selected.clear();
	});

	const analysis = $derived(studio.analysis!);
	const categories = $derived.by(() => {
		void studio.version;
		return [...studio.document!.categories];
	});
	const knownCategoryUids = $derived(new Set(categories.map((existing) => existing.uid)));
	const genres = $derived(genreStats(analysis.entries));

	const filtered = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return analysis.entries
			.filter((entry) => {
				if (library === 'in' && !entry.manga.favorite) return false;
				if (library === 'out' && entry.manga.favorite) return false;
				if (group !== 'all' && entry.group !== group) return false;
				if (source !== 'all' && entry.manga.sourceKey !== source) return false;
				if (genre !== 'all' && !hasGenre(entry.manga, genre)) return false;
				if (status !== 'all' && entry.manga.status !== Number(status)) return false;
				if (category === DEFAULT_CATEGORY) {
					if (entry.manga.categoryUids.some((uid) => knownCategoryUids.has(uid))) return false;
				} else if (category !== 'all' && !entry.manga.categoryUids.includes(category)) return false;
				return !needle || entry.manga.title.toLowerCase().includes(needle);
			})
			.sort(sorters[sortBy].compare);
	});

	const pageCount = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const visible = $derived(filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize));

	$effect(() => {
		void filtered;
		if (pageIndex >= pageCount) pageIndex = 0;
	});

	const allVisibleSelected = $derived(visible.length > 0 && visible.every((entry) => selected.has(entry.manga.uid)));

	function toggleVisible() {
		const select = !allVisibleSelected;
		for (const entry of visible) {
			if (select) selected.add(entry.manga.uid);
			else selected.delete(entry.manga.uid);
		}
	}

	function selectAllFiltered() {
		for (const entry of filtered) selected.add(entry.manga.uid);
	}

	function bulk(action: () => void) {
		action();
		selected.clear();
	}

	const categoryNames = (entry: EntryInsight) =>
		entry.manga.categoryUids.map((uid) => studio.categoryName(uid)).join(', ') || (entry.manga.favorite ? 'Default' : '—');
</script>

<div class="page">
	<div class="row" style="justify-content: space-between">
		<h1>Entries</h1>
		<button class="primary" onclick={() => (creating = true)}>New entry</button>
	</div>

	<div class="panel row filters">
		<input placeholder="Search a title…" bind:value={query} style="flex: 1 1 220px" />
		<select bind:value={library} aria-label="Library">
			<option value="in">In library</option>
			<option value="out">Not in library</option>
			<option value="all">All entries</option>
		</select>
		<select bind:value={category} aria-label="Category">
			<option value="all">All categories</option>
			<option value={DEFAULT_CATEGORY}>Default (no category)</option>
			{#each categories as option (option.uid)}
				<option value={option.uid}>{option.name}</option>
			{/each}
		</select>
		<select bind:value={group} aria-label="Group">
			<option value="all">All groups</option>
			{#each Object.entries(groups) as [key, info] (key)}
				<option value={key}>{info.label}</option>
			{/each}
		</select>
		<select bind:value={source} aria-label="Source">
			<option value="all">All sources</option>
			{#each analysis.sources as option (option.key)}
				<option value={option.key}>{option.name} ({option.entryCount})</option>
			{/each}
		</select>
		<select bind:value={genre} aria-label="Genre">
			<option value="all">All genres</option>
			{#each genres as option (option.key)}
				<option value={option.key}>{option.label} ({option.count})</option>
			{/each}
		</select>
		<select bind:value={status} aria-label="Publication status">
			<option value="all">All statuses</option>
			{#each Object.entries(MangaStatus) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<select bind:value={sortBy} aria-label="Sort">
			{#each Object.entries(sorters) as [key, sorter] (key)}
				<option value={key}>Sort: {sorter.label}</option>
			{/each}
		</select>
		<label class="row small" title="Loads cover images from each entry's source website">
			<input type="checkbox" checked={studio.showCovers} onchange={(event) => studio.setShowCovers(event.currentTarget.checked)} />
			Covers
		</label>
	</div>

	<div class="panel row bulk" class:active={selected.size > 0}>
		<strong>{selected.size} selected</strong>
		<button class="small" onclick={selectAllFiltered}>Select all {filtered.length} filtered</button>
		<button class="small" onclick={() => selected.clear()} disabled={!selected.size}>Clear</button>
		<span class="divider"></span>
		<select bind:value={targetCategory} aria-label="Target category">
			<option value="">Category…</option>
			{#each categories as option (option.uid)}
				<option value={option.uid}>{option.name}</option>
			{/each}
		</select>
		<button disabled={!selected.size || !targetCategory} onclick={() => bulk(() => studio.setCategories(selected, [targetCategory]))}>
			Move to
		</button>
		<button disabled={!selected.size || !targetCategory} onclick={() => bulk(() => studio.addToCategory(selected, targetCategory))}>
			Add to
		</button>
		<button
			disabled={!selected.size || !targetCategory}
			onclick={() => bulk(() => studio.removeFromCategory(selected, targetCategory))}>Remove from</button
		>
		<span class="divider"></span>
		<button disabled={!selected.size} onclick={() => bulk(() => studio.setInLibrary(selected, false))}>Remove from library</button>
		<button disabled={!selected.size} onclick={() => bulk(() => studio.setInLibrary(selected, true))}>Add to library</button>
		<button
			class="danger"
			disabled={!selected.size}
			onclick={() => {
				if (confirm(`Delete ${selected.size} entries from the backup, with their chapters and history?`))
					bulk(() => studio.deleteEntries(selected));
			}}>Delete</button
		>
	</div>

	<div class="panel table-wrap" style="padding: 0">
		<table>
			<thead>
				<tr>
					<th><input type="checkbox" checked={allVisibleSelected} onchange={toggleVisible} aria-label="Select page" /></th>
					<th>Title</th>
					<th>Category</th>
					<th>Group</th>
					<th>Read</th>
					<th>Last read</th>
					<th>Newest chapter</th>
					<th>Source</th>
				</tr>
			</thead>
			<tbody>
				{#each visible as entry (entry.manga.uid)}
					<tr class:selected={selected.has(entry.manga.uid)}>
						<td>
							<input
								type="checkbox"
								checked={selected.has(entry.manga.uid)}
								onchange={(event) =>
									event.currentTarget.checked ? selected.add(entry.manga.uid) : selected.delete(entry.manga.uid)}
								aria-label="Select {entry.manga.title}"
							/>
						</td>
						<td class="title">
							<span class="title-cell">
								{#if studio.showCovers && entry.manga.thumbnailUrl}
									<img
										class="cover"
										src={entry.manga.thumbnailUrl}
										alt=""
										loading="lazy"
										referrerpolicy="no-referrer"
										onerror={(event) => ((event.currentTarget as HTMLImageElement).style.visibility = 'hidden')}
									/>
								{/if}
								<button class="link" onclick={() => (studio.openEntryUid = entry.manga.uid)}>{entry.manga.title || '(untitled)'}</button>
							</span>
						</td>
						<td class="small">{categoryNames(entry)}</td>
						<td>
							<span class="tag" title={groups[entry.group as Group].hint}>
								<span class="dot" style:background={groups[entry.group as Group].color}></span>
								{groups[entry.group as Group].label}
							</span>
						</td>
						<td class="small nowrap">{entry.readCount} / {entry.chapterCount}</td>
						<td class="small nowrap">
							{formatAge(entry.lastRead, analysis.referenceTime)}{entry.lastReadRecovered ? ' ↩' : ''}
						</td>
						<td class="small nowrap">{formatAge(entry.lastUpload, analysis.referenceTime)}</td>
						<td class="small nowrap">{entry.sourceName}</td>
					</tr>
				{:else}
					<tr><td colspan="8" class="muted">No entry matches these filters.</td></tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="row" style="justify-content: space-between">
		<span class="muted small">{filtered.length} entries</span>
		<div class="row">
			<button disabled={pageIndex === 0} onclick={() => pageIndex--}>Previous</button>
			<span class="small">Page {pageIndex + 1} / {pageCount}</span>
			<button disabled={pageIndex >= pageCount - 1} onclick={() => pageIndex++}>Next</button>
		</div>
	</div>
</div>

{#if creating}
	<NewEntryDialog onclose={() => (creating = false)} />
{/if}

<style>
	.bulk {
		position: sticky;
		top: 0;
		z-index: 2;
		padding: 10px 16px;
	}

	.bulk.active {
		border-color: var(--accent);
	}

	.divider {
		width: 1px;
		align-self: stretch;
		background: var(--border);
	}

	.title {
		max-width: 360px;
	}

	.title-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.title-cell .link {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cover {
		width: 26px;
		height: 36px;
		object-fit: cover;
		border-radius: 4px;
		background: var(--panel-2);
		flex: none;
	}

	.nowrap {
		white-space: nowrap;
	}

	tr.selected td {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.small {
		font-size: 12px;
	}
</style>
