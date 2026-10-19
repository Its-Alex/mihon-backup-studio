<script lang="ts">
	import {
		decodeAppPreferences,
		decodeExtensionRepos,
		decodeSourcePreferences
	} from '#lib/backup/preferences.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const document = $derived.by(() => {
		void studio.version;
		return studio.document!;
	});

	const appPreferences = $derived(decodeAppPreferences(document));
	const sourcePreferences = $derived(decodeSourcePreferences(document));
	const repos = $derived(decodeExtensionRepos(document));

	let filter = $state('');
	const visibleAppPreferences = $derived.by(() => {
		const needle = filter.trim().toLowerCase();
		return needle
			? appPreferences.filter((preference) => preference.key.toLowerCase().includes(needle))
			: appPreferences;
	});
</script>

<div class="page">
	<h1>Preferences</h1>
	<p class="muted" style="margin: 0">
		The settings this backup carries, read-only. They are restored along with the library; the Export page can strip
		them from the downloaded file.
	</p>

	<section class="panel stack">
		<div class="row" style="justify-content: space-between">
			<h2>App settings ({appPreferences.length})</h2>
			<input placeholder="Filter by key…" bind:value={filter} />
		</div>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Key</th>
						<th>Type</th>
						<th>Value</th>
					</tr>
				</thead>
				<tbody>
					{#each visibleAppPreferences as preference (preference.key)}
						<tr>
							<td class="mono small">{preference.key}</td>
							<td class="small muted">{preference.type}</td>
							<td class="small break">{preference.value}</td>
						</tr>
					{:else}
						<tr><td colspan="3" class="muted">No app settings{filter ? ' match this filter' : ' in this backup'}.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="panel stack">
		<h2>Source settings ({sourcePreferences.length} sources)</h2>
		{#each sourcePreferences as source (source.fileName)}
			<details>
				<summary>
					{source.sourceName ?? 'Unknown source'}
					<span class="muted small mono">({source.fileName})</span>
					<span class="muted small">· {source.entries.length} settings</span>
				</summary>
				<table>
					<tbody>
						{#each source.entries as preference (preference.key)}
							<tr>
								<td class="mono small">{preference.key}</td>
								<td class="small muted">{preference.type}</td>
								<td class="small break">{preference.value}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</details>
		{:else}
			<p class="muted" style="margin: 0">No source settings in this backup.</p>
		{/each}
	</section>

	<section class="panel stack">
		<h2>Extension repositories ({repos.length})</h2>
		{#each repos as repo (repo.baseUrl)}
			<div class="stack" style="gap: 4px">
				<div class="row">
					<strong>{repo.name || repo.shortName || repo.baseUrl}</strong>
					{#if repo.shortName}<span class="tag">{repo.shortName}</span>{/if}
				</div>
				<div class="small break mono">{repo.baseUrl}</div>
				{#if repo.website}<a class="small" href={repo.website} target="_blank" rel="noreferrer">{repo.website}</a>{/if}
				{#if repo.fingerprint}<div class="muted small mono break">Signing key: {repo.fingerprint}</div>{/if}
			</div>
		{:else}
			<p class="muted" style="margin: 0">No extension repositories in this backup.</p>
		{/each}
	</section>
</div>

<style>
	.mono {
		font-family: ui-monospace, 'Cascadia Code', 'JetBrains Mono', Menlo, monospace;
	}

	.break {
		word-break: break-all;
	}

	summary {
		cursor: pointer;
	}

	details table {
		margin-top: 8px;
	}
</style>
