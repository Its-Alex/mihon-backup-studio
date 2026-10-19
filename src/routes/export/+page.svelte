<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { BackupField, type Manga } from '#lib/backup/model.ts';
	import { DEFAULT_CATEGORY } from '#lib/backup/views.ts';
	import { studio } from '#lib/studio.svelte.ts';

	let exporting = $state(false);
	let error = $state('');
	let includeAppPreferences = $state(true);
	let includeSourcePreferences = $state(true);
	let scope = $state<'all' | 'categories'>('all');
	let keepOutside = $state(true);
	const selectedCategories = new SvelteSet<string>();

	const backup = $derived.by(() => {
		void studio.version;
		return studio.document!;
	});
	const categories = $derived([...backup.categories]);
	const knownCategoryUids = $derived(new Set(categories.map((category) => category.uid)));
	const appPreferenceCount = $derived(backup.otherFieldValues(BackupField.appPreferences).length);
	const sourcePreferenceCount = $derived(
		backup.otherFieldValues(BackupField.sourcePreferences).length
	);

	const mangaFilter = $derived.by(() => {
		if (scope === 'all') return null;
		const selected = new Set(selectedCategories);
		const known = knownCategoryUids;
		const includeOutside = keepOutside;
		const includeDefault = selected.has(DEFAULT_CATEGORY);
		return (manga: Manga) => {
			if (!manga.favorite) return includeOutside;
			if (manga.categoryUids.some((uid) => selected.has(uid))) return true;
			return includeDefault && !manga.categoryUids.some((uid) => known.has(uid));
		};
	});

	const totals = $derived.by(() => {
		const mangas = backup.mangas.filter((manga) => !mangaFilter || mangaFilter(manga));
		return {
			library: mangas.filter((manga) => manga.favorite).length,
			all: mangas.length,
			categories: categories.length
		};
	});

	const trimmed = $derived(
		!includeAppPreferences || !includeSourcePreferences || mangaFilter !== null
	);

	function exportName() {
		const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
		return `app.mihon_${stamp}_edited.tachibk`;
	}

	async function download() {
		exporting = true;
		error = '';
		try {
			const blob = await studio.exportBackup({
				includeAppPreferences,
				includeSourcePreferences,
				...(mangaFilter ? { includeManga: mangaFilter } : {})
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = exportName();
			link.click();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : String(cause);
		} finally {
			exporting = false;
		}
	}

	function toggleCategory(uid: string, checked: boolean) {
		if (checked) selectedCategories.add(uid);
		else selectedCategories.delete(uid);
	}
</script>

<div class="page">
	<h1>Export</h1>

	<div class="warning-box stack" style="gap: 6px">
		<strong>Restoring is a merge, not a replace.</strong>
		<span>
			Mihon keeps an entry in the library if it is in the library either on the device or in the backup, and it keeps the
			device's own titles and details. Removals, deletions and detail edits only take effect on an empty app: back up first,
			then clear Mihon's app storage from Android's app settings (or reinstall), and restore this file. On a normal
			restore, only category changes on entries that keep a category, new categories, new entries and chapters marked read
			take effect.
		</span>
	</div>

	<section class="panel stack">
		<h2>What goes into the file</h2>
		<label class="row">
			<input type="checkbox" bind:checked={includeAppPreferences} />
			App settings ({appPreferenceCount})
		</label>
		<label class="row">
			<input type="checkbox" bind:checked={includeSourcePreferences} />
			Source settings ({sourcePreferenceCount}) — can carry per-source filters and account details
		</label>
		<div class="row">
			<label class="row">
				<input type="radio" bind:group={scope} value="all" />
				Every entry
			</label>
			<label class="row">
				<input type="radio" bind:group={scope} value="categories" />
				Only selected categories
			</label>
		</div>
		{#if scope === 'categories'}
			<div class="row" style="padding-left: 22px">
				<label class="row small chip">
					<input
						type="checkbox"
						checked={selectedCategories.has(DEFAULT_CATEGORY)}
						onchange={(event) => toggleCategory(DEFAULT_CATEGORY, event.currentTarget.checked)}
					/>
					Default (no category)
				</label>
				{#each categories as category (category.uid)}
					<label class="row small chip">
						<input
							type="checkbox"
							checked={selectedCategories.has(category.uid)}
							onchange={(event) => toggleCategory(category.uid, event.currentTarget.checked)}
						/>
						{category.name}
					</label>
				{/each}
			</div>
			<label class="row small" style="padding-left: 22px">
				<input type="checkbox" bind:checked={keepOutside} />
				Keep entries outside the library (they hold the recovered reading history)
			</label>
		{/if}
		{#if trimmed}
			<p class="muted small" style="margin: 0">
				This export is trimmed: keep the original backup as your full copy.
			</p>
		{/if}
	</section>

	<section class="panel stack">
		<h2>Result</h2>
		<div class="row">
			<span class="tag">{totals.library} in library</span>
			<span class="tag">{totals.all} entries in total</span>
			<span class="tag">{totals.categories} categories</span>
		</div>
		<div class="row">
			<button class="primary" onclick={download} disabled={exporting}>{exporting ? 'Writing…' : 'Download edited backup'}</button>
			<button
				class="danger"
				disabled={!studio.changes.length}
				onclick={() => confirm('Undo every edit and go back to the loaded file?') && studio.reset()}>Discard all edits</button
			>
		</div>
		{#if error}<p style="color: var(--danger)">{error}</p>{/if}
		<p class="muted small" style="margin: 0">
			Fields this tool does not edit (trackers, extension settings, unknown future fields) are copied byte for byte from
			the loaded file, unless stripped above.
		</p>
	</section>

	<section class="panel stack">
		<h2>Changes ({studio.changes.length})</h2>
		{#if studio.changes.length}
			<ol class="changes">
				{#each studio.changes as change, index (index)}
					<li>{change}</li>
				{/each}
			</ol>
		{:else}
			<p class="muted">No edits yet. With nothing stripped above, the download is identical to the loaded backup.</p>
		{/if}
	</section>
</div>

<style>
	.changes {
		margin: 0;
		padding-left: 20px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.chip {
		background: var(--panel-2);
		border-radius: 999px;
		padding: 3px 10px 3px 6px;
		gap: 4px;
	}
</style>
