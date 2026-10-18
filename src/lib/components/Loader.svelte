<script lang="ts">
	import { studio } from '#lib/studio.svelte.ts';

	let dragging = $state(false);

	function pick(files: FileList | null | undefined) {
		const file = files?.[0];
		if (file) studio.load(file);
	}

	$effect(() => {
		const backupUrl = import.meta.env.DEV ? new URL(location.href).searchParams.get('backup') : null;
		if (!backupUrl) return;
		fetch(backupUrl)
			.then((response) => response.blob())
			.then((blob) => studio.load(new File([blob], backupUrl.split('/').pop() ?? 'backup.tachibk')));
	});
</script>

<div class="wrap">
	<label
		class="drop"
		class:dragging
		ondragover={(event) => {
			event.preventDefault();
			dragging = true;
		}}
		ondragleave={() => (dragging = false)}
		ondrop={(event) => {
			event.preventDefault();
			dragging = false;
			pick(event.dataTransfer?.files);
		}}
	>
		<input type="file" accept=".tachibk,.proto.gz,.gz" onchange={(event) => pick(event.currentTarget.files)} hidden />
		<h1>Mihon Backup Studio</h1>
		{#if studio.loading}
			<p>Reading backup…</p>
		{:else}
			<p>Drop a <code>.tachibk</code> backup here, or click to choose one.</p>
			<p class="muted small">
				Everything runs in this browser tab. The backup is never uploaded anywhere.
			</p>
		{/if}
		{#if studio.error}
			<p class="error">{studio.error}</p>
		{/if}
	</label>
</div>

<style>
	.wrap {
		min-height: 100vh;
		display: grid;
		place-items: center;
		padding: 24px;
	}

	.drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		text-align: center;
		padding: 56px 64px;
		max-width: 560px;
		border: 2px dashed var(--border);
		border-radius: 16px;
		background: var(--panel);
		cursor: pointer;
	}

	.drop.dragging,
	.drop:hover {
		border-color: var(--accent);
	}

	.error {
		color: var(--danger);
	}
</style>
