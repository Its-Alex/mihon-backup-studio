<script lang="ts">
	import { resolve } from '$app/paths';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { formatAge } from '#lib/backup/analysis.ts';
	import { actionLabels, buildSuggestions, type CleanupAction, type Suggestion } from '#lib/backup/cleanup.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const categories = $derived.by(() => {
		void studio.version;
		return [...studio.document!.categories];
	});
	const findCategory = (pattern: RegExp) => categories.find((category) => pattern.test(category.name))?.uid ?? '';

	let abandonedDays = $state(365);
	let dailyCategoryUid = $state(
		studio.document!.categories.find((category) => /top|daily|reading/i.test(category.name))?.uid ?? ''
	);
	const referenceTime = $derived(studio.analysis!.referenceTime);
	const suggestions = $derived(
		buildSuggestions(studio.analysis!, { abandonedDays, dailyCategoryUid: dailyCategoryUid || null })
	);

	const toggled = new SvelteSet<string>();
	const chosenAction = new SvelteMap<string, CleanupAction>();
	const chosenCategory = new SvelteMap<string, string>();
	const expanded = new SvelteSet<string>();
	const defaultTarget = $derived(findCategory(/read|finish|done|complete/i) || categories[0]?.uid || '');

	const key = (suggestion: Suggestion, uid: string) => `${suggestion.id}:${uid}`;
	const isSelected = (suggestion: Suggestion, uid: string) => suggestion.selectedByDefault !== toggled.has(key(suggestion, uid));
	const selectedUids = (suggestion: Suggestion) =>
		suggestion.entries.filter((entry) => isSelected(suggestion, entry.manga.uid)).map((entry) => entry.manga.uid);
	const actionOf = (suggestion: Suggestion) => chosenAction.get(suggestion.id) ?? suggestion.actions[0];
	const targetOf = (suggestion: Suggestion) => chosenCategory.get(suggestion.id) ?? defaultTarget;

	function setAll(suggestion: Suggestion, selected: boolean) {
		for (const entry of suggestion.entries) {
			const id = key(suggestion, entry.manga.uid);
			if (selected === suggestion.selectedByDefault) toggled.delete(id);
			else toggled.add(id);
		}
	}

	function apply(suggestion: Suggestion) {
		const uids = selectedUids(suggestion);
		if (!uids.length) return;
		const action = actionOf(suggestion);
		if (action === 'deleteFromBackup' && !confirm(`Delete ${uids.length} entries from the backup, with their chapters and history?`)) return;
		if (action === 'removeFromLibrary') studio.setInLibrary(uids, false);
		else if (action === 'deleteFromBackup') studio.deleteEntries(uids);
		else studio.setCategories(uids, [targetOf(suggestion)], `${suggestion.title}: moved ${uids.length} entries to “${studio.categoryName(targetOf(suggestion))}”`);
		for (const id of [...toggled]) if (id.startsWith(`${suggestion.id}:`)) toggled.delete(id);
	}
</script>

<div class="page">
	<h1>Cleanup</h1>
	<p class="muted">
		Suggestions recompute after every change. Nothing leaves this tab until you export. Thresholds for “active”, “silent”
		and frozen sources live in <a href={resolve('/settings')}>Settings</a>.
	</p>

	<div class="panel row">
		<label class="row">Abandoned after <input type="number" min="30" step="30" bind:value={abandonedDays} style="width: 90px" /> days</label>
		<label class="row">
			Daily-reads category
			<select bind:value={dailyCategoryUid}>
				<option value="">None</option>
				{#each categories as category (category.uid)}
					<option value={category.uid}>{category.name}</option>
				{/each}
			</select>
		</label>
	</div>

	{#each suggestions as suggestion (suggestion.id)}
		{@const selectedCount = selectedUids(suggestion).length}
		{@const action = actionOf(suggestion)}
		<section class="panel stack">
			<div class="row" style="justify-content: space-between">
				<h2>{suggestion.title} <span class="muted">· {suggestion.entries.length}</span></h2>
				<button class="link small" onclick={() => (expanded.has(suggestion.id) ? expanded.delete(suggestion.id) : expanded.add(suggestion.id))}>
					{expanded.has(suggestion.id) ? 'Hide entries' : 'Review entries'}
				</button>
			</div>
			<p class="muted small" style="margin: 0">{suggestion.description}</p>

			{#if expanded.has(suggestion.id)}
				<div class="row small">
					<button class="small" onclick={() => setAll(suggestion, true)}>Select all</button>
					<button class="small" onclick={() => setAll(suggestion, false)}>Select none</button>
				</div>
				<div class="entries">
					{#each suggestion.entries as entry (entry.manga.uid)}
						<label class="entry">
							<input
								type="checkbox"
								checked={isSelected(suggestion, entry.manga.uid)}
								onchange={() => {
									const id = key(suggestion, entry.manga.uid);
									if (toggled.has(id)) toggled.delete(id);
									else toggled.add(id);
								}}
							/>
							<button class="link title" onclick={(event) => (event.preventDefault(), (studio.openEntryUid = entry.manga.uid))}>
								{entry.manga.title}
							</button>
							<span class="muted small meta">
								{entry.readCount}/{entry.chapterCount} · read {formatAge(entry.lastRead, referenceTime)} · new ch {formatAge(
									entry.lastUpload,
									referenceTime
								)} · {entry.sourceName}
							</span>
						</label>
					{/each}
				</div>
			{/if}

			<div class="row">
				<select value={action} onchange={(event) => chosenAction.set(suggestion.id, event.currentTarget.value as CleanupAction)}>
					{#each suggestion.actions as option (option)}
						<option value={option}>{actionLabels[option]}</option>
					{/each}
				</select>
				{#if action === 'moveToCategory'}
					<select value={targetOf(suggestion)} onchange={(event) => chosenCategory.set(suggestion.id, event.currentTarget.value)}>
						{#each categories as category (category.uid)}
							<option value={category.uid}>{category.name}</option>
						{/each}
					</select>
				{/if}
				<button
					class={action === 'deleteFromBackup' ? 'danger' : 'primary'}
					disabled={!selectedCount || (action === 'moveToCategory' && !targetOf(suggestion))}
					onclick={() => apply(suggestion)}
				>
					Apply to {selectedCount} selected
				</button>
			</div>
		</section>
	{:else}
		<div class="panel">Nothing left to suggest with these settings.</div>
	{/each}
</div>

<style>
	.entries {
		max-height: 340px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 4px 10px;
	}

	.entry {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) minmax(0, 320px);
		gap: 8px;
		align-items: center;
		padding: 3px 0;
	}

	.title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}

	.meta {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
