<script lang="ts">
	import '../app.css';
	import favicon from '#lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Loader from '#lib/components/Loader.svelte';
	import EntryDrawer from '#lib/components/EntryDrawer.svelte';
	import { studio } from '#lib/studio.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const navigation = [
		{ href: resolve('/'), label: 'Dashboard' },
		{ href: resolve('/map'), label: 'Library map' },
		{ href: resolve('/entries'), label: 'Entries' },
		{ href: resolve('/categories'), label: 'Categories' },
		{ href: resolve('/cleanup'), label: 'Cleanup' },
		{ href: resolve('/settings'), label: 'Settings' },
		{ href: resolve('/export'), label: 'Export' }
	];

	function warnBeforeLeaving(event: BeforeUnloadEvent) {
		if (studio.changes.length) event.preventDefault();
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Mihon Backup Studio</title>
</svelte:head>

<svelte:window onbeforeunload={warnBeforeLeaving} />

{#if !studio.document}
	<Loader />
{:else}
	<div class="shell">
		<nav>
			<div class="brand">Mihon Backup Studio</div>
			<div class="file muted small" title={studio.fileName}>{studio.fileName}</div>
			{#each navigation as item (item.href)}
				<a href={item.href} class:current={page.url.pathname === item.href}>
					{item.label}
					{#if item.label === 'Export' && studio.changes.length}
						<span class="badge">{studio.changes.length}</span>
					{/if}
				</a>
			{/each}
			<div class="spacer"></div>
			<button
				class="small"
				onclick={() => {
					if (!studio.changes.length || confirm('Discard all unsaved edits and close this backup?')) studio.close();
				}}>Open another backup</button
			>
		</nav>
		<main>
			{@render children()}
		</main>
	</div>
	<EntryDrawer />
{/if}

<style>
	.shell {
		display: grid;
		grid-template-columns: 210px 1fr;
		min-height: 100vh;
	}

	nav {
		position: sticky;
		top: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 18px 12px;
		border-right: 1px solid var(--border);
		background: var(--panel);
	}

	.brand {
		font-weight: 700;
		padding: 0 10px;
	}

	.file {
		padding: 2px 10px 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	nav a {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 7px 10px;
		border-radius: 7px;
		color: var(--text);
		text-decoration: none;
	}

	nav a:hover {
		background: var(--panel-2);
	}

	nav a.current {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
		font-weight: 600;
	}

	.badge {
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 999px;
		font-size: 11px;
		padding: 0 7px;
	}

	.spacer {
		flex: 1;
	}

	main {
		min-width: 0;
	}

	@media (max-width: 760px) {
		.shell {
			grid-template-columns: 1fr;
		}

		nav {
			position: static;
			height: auto;
			flex-direction: row;
			flex-wrap: wrap;
			border-right: none;
			border-bottom: 1px solid var(--border);
		}

		.file,
		.spacer {
			display: none;
		}
	}
</style>
