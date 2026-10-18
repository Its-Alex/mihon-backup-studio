<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { DEFAULT_CATEGORY, libraryByCategory } from '#lib/backup/views.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const categories = $derived.by(() => {
		void studio.version;
		return [...studio.document!.categories];
	});
	const countByUid = $derived(
		new Map(libraryByCategory(studio.document!, studio.analysis!.entries).map((bucket) => [bucket.uid, bucket.entries.length]))
	);

	let newName = $state('');
	let deleting = $state<string | null>(null);
	let moveTo = $state('');

	const nameTaken = (name: string, exceptUid?: string) =>
		categories.some((category) => category.uid !== exceptUid && category.name.trim().toLowerCase() === name.trim().toLowerCase());

	function add() {
		const name = newName.trim();
		if (!name || nameTaken(name)) return;
		studio.addCategory(name);
		newName = '';
	}

	function rename(uid: string, input: HTMLInputElement) {
		const name = input.value.trim();
		const category = studio.category(uid);
		if (!category) return;
		if (!name || nameTaken(name, uid)) {
			input.value = category.name;
			return;
		}
		studio.renameCategory(uid, name);
	}
</script>

<div class="page">
	<h1>Categories</h1>
	<p class="muted">
		Mihon restores categories by name and keeps them in this order. Entries without a category land in Mihon's “Default”.
	</p>

	<div class="panel stack">
		{#if countByUid.has(DEFAULT_CATEGORY)}
			<div class="category">
				<span class="handle muted">—</span>
				<span class="muted">Default (no category)</span>
				<button class="link small" onclick={() => goto(`${resolve('/entries')}?category=${DEFAULT_CATEGORY}`)}>
					{countByUid.get(DEFAULT_CATEGORY)} entries
				</button>
			</div>
		{/if}
		{#each categories as category, index (category.uid)}
			<div class="category">
				<div class="handle">
					<button class="small" disabled={index === 0} onclick={() => studio.moveCategory(category.uid, -1)} aria-label="Move up">↑</button>
					<button
						class="small"
						disabled={index === categories.length - 1}
						onclick={() => studio.moveCategory(category.uid, 1)}
						aria-label="Move down">↓</button
					>
				</div>
				<input
					value={category.name}
					aria-label="Category name"
					onchange={(event) => rename(category.uid, event.currentTarget)}
					onkeydown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
				/>
				<button class="link small" onclick={() => goto(`${resolve('/entries')}?category=${category.uid}`)}>
					{countByUid.get(category.uid) ?? 0} entries
				</button>
				<button class="small danger" onclick={() => ((deleting = category.uid), (moveTo = ''))}>Delete</button>
			</div>
			{#if deleting === category.uid}
				<div class="confirm row">
					<span>Delete “{category.name}”. Its entries:</span>
					<select bind:value={moveTo}>
						<option value="">stay in their other categories (or Default)</option>
						{#each categories.filter((other) => other.uid !== category.uid) as other (other.uid)}
							<option value={other.uid}>move to “{other.name}”</option>
						{/each}
					</select>
					<button
						class="danger"
						onclick={() => {
							studio.deleteCategory(category.uid, moveTo || null);
							deleting = null;
						}}>Delete</button
					>
					<button onclick={() => (deleting = null)}>Cancel</button>
				</div>
			{/if}
		{/each}

		<form
			class="row add"
			onsubmit={(event) => {
				event.preventDefault();
				add();
			}}
		>
			<input placeholder="New category name" bind:value={newName} />
			<button class="primary" type="submit" disabled={!newName.trim() || nameTaken(newName)}>Add category</button>
			{#if newName.trim() && nameTaken(newName)}<span class="small" style="color: var(--danger)">Name already used</span>{/if}
		</form>
	</div>
</div>

<style>
	.category {
		display: grid;
		grid-template-columns: 76px minmax(0, 320px) 100px auto;
		gap: 10px;
		align-items: center;
	}

	.handle {
		display: flex;
		gap: 4px;
	}

	.handle button {
		padding: 2px 8px;
	}

	.confirm {
		padding: 10px 12px;
		border-radius: 8px;
		background: color-mix(in srgb, var(--danger) 10%, transparent);
	}

	.add {
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}
</style>
