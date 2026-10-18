<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';

	let { onclose }: { onclose: () => void } = $props();

	const sources = $derived(
		[...studio.document!.sourceNames]
			.map(([key, name]) => ({ key, name: name || key }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
	const categories = $derived(studio.document!.categories);

	let sourceKey = $state('');
	let customSourceKey = $state('');
	let url = $state('');
	let title = $state('');
	let categoryUids = $state<string[]>([]);

	const resolvedSourceKey = $derived(sourceKey === 'custom' ? customSourceKey.trim() : sourceKey);
	const valid = $derived(/^-?\d+$/.test(resolvedSourceKey) && url.trim() !== '' && title.trim() !== '');

	function create() {
		const uid = studio.createEntry({ sourceKey: resolvedSourceKey, url: url.trim(), title: title.trim(), categoryUids });
		onclose();
		studio.openEntryUid = uid;
	}
</script>

<div class="overlay" role="presentation" onclick={(event) => event.target === event.currentTarget && onclose()}>
	<form
		class="panel stack dialog"
		onsubmit={(event) => {
			event.preventDefault();
			if (valid) create();
		}}
	>
		<h2>New entry</h2>
		<p class="muted small">
			Mihon identifies an entry by its source and the URL path the source uses for it. The rest (cover, chapters, details)
			is fetched when you refresh it in the app.
		</p>
		<label class="stack field">
			Source
			<select bind:value={sourceKey} required>
				<option value="" disabled>Choose a source…</option>
				{#each sources as source (source.key)}
					<option value={source.key}>{source.name}</option>
				{/each}
				<option value="custom">Other (enter its id)</option>
			</select>
		</label>
		{#if sourceKey === 'custom'}
			<label class="stack field">
				Source id
				<input bind:value={customSourceKey} inputmode="numeric" placeholder="e.g. 2499283573021220255" />
			</label>
		{/if}
		<label class="stack field">
			URL path
			<input bind:value={url} placeholder="/manga/some-series" required />
		</label>
		<label class="stack field">
			Title
			<input bind:value={title} required />
		</label>
		<fieldset class="row">
			<legend class="small muted">Categories</legend>
			{#each categories as category (category.uid)}
				<label class="row small"><input type="checkbox" value={category.uid} bind:group={categoryUids} /> {category.name}</label>
			{/each}
		</fieldset>
		<div class="row" style="justify-content: flex-end">
			<button type="button" onclick={onclose}>Cancel</button>
			<button class="primary" type="submit" disabled={!valid}>Create</button>
		</div>
	</form>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-items: center;
		background: rgb(0 0 0 / 0.45);
		padding: 16px;
	}

	.dialog {
		width: min(480px, 100%);
	}

	.field {
		gap: 4px;
	}

	fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}
</style>
