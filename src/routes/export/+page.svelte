<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';

	let exporting = $state(false);
	let error = $state('');

	const totals = $derived.by(() => {
		const entries = studio.analysis!.entries;
		return {
			library: entries.filter((entry) => entry.manga.favorite).length,
			all: entries.length,
			categories: studio.document!.categories.length
		};
	});

	function exportName() {
		const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
		return `app.mihon_${stamp}_edited.tachibk`;
	}

	async function download() {
		exporting = true;
		error = '';
		try {
			const blob = await studio.exportBackup();
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
			Fields this tool does not edit (preferences, trackers, extension settings, unknown future fields) are copied byte for
			byte from the loaded file.
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
			<p class="muted">No edits yet. The download would be identical to the loaded backup.</p>
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
</style>
