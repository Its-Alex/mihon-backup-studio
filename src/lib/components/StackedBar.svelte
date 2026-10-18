<script lang="ts">
	interface Segment {
		key: string;
		label: string;
		count: number;
		color: string;
	}

	let { segments, onselect }: { segments: Segment[]; onselect?: (key: string) => void } = $props();

	const total = $derived(segments.reduce((sum, segment) => sum + segment.count, 0));
</script>

<div class="bar">
	{#each segments.filter((segment) => segment.count > 0) as segment (segment.key)}
		<button
			class="segment"
			style:width="{(100 * segment.count) / total}%"
			style:background={segment.color}
			title="{segment.label}: {segment.count}"
			aria-label="{segment.label}: {segment.count}"
			onclick={() => onselect?.(segment.key)}
		></button>
	{/each}
</div>

<style>
	.bar {
		display: flex;
		height: 14px;
		border-radius: 7px;
		overflow: hidden;
		background: var(--panel-2);
	}

	.segment {
		border: none;
		border-radius: 0;
		padding: 0;
		height: 100%;
		min-width: 3px;
	}

	.segment:hover {
		filter: brightness(1.15);
	}
</style>
