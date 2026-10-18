<script lang="ts">
	import { DAY, defaultSettings, formatAge } from '#lib/backup/analysis.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);
	const settings = studio.settings;

	const thresholds = [
		{ key: 'activeDays', label: 'Active if read within (days)' },
		{ key: 'silentDays', label: 'Caught-up series count as silent after (days without a new chapter)' },
		{ key: 'notStartedMaxRead', label: 'Not started if at most this many chapters read' },
		{ key: 'frozenSourceDays', label: 'A source entry is stale after (days without a new chapter)' },
		{ key: 'frozenSourceMinEntries', label: 'Only judge sources with at least this many entries' }
	] as const;

	function setOverride(key: string, value: string) {
		if (value === 'auto') delete settings.frozenSourceOverrides[key];
		else settings.frozenSourceOverrides[key] = value === 'frozen';
		studio.saveSettings();
	}

	function restoreDefaults() {
		Object.assign(settings, structuredClone(defaultSettings));
		studio.saveSettings();
	}
</script>

<div class="page">
	<div class="row" style="justify-content: space-between">
		<h1>Settings</h1>
		<button onclick={restoreDefaults}>Restore defaults</button>
	</div>
	<p class="muted">These only change how entries are grouped. They are saved in this browser, not in the backup.</p>

	<section class="panel stack">
		<h2>Thresholds</h2>
		{#each thresholds as threshold (threshold.key)}
			<label class="threshold">
				<span>{threshold.label}</span>
				<input type="number" min="0" bind:value={settings[threshold.key]} onchange={() => studio.saveSettings()} />
			</label>
		{/each}
		<label class="threshold">
			<span>A source is frozen when this share of its entries is stale (%)</span>
			<input
				type="number"
				min="0"
				max="100"
				value={Math.round(settings.frozenSourceShare * 100)}
				onchange={(event) => {
					settings.frozenSourceShare = Number(event.currentTarget.value) / 100;
					studio.saveSettings();
				}}
			/>
		</label>
	</section>

	<section class="panel stack">
		<h2>Frozen sources</h2>
		<p class="muted small" style="margin: 0">
			A frozen source no longer returns new chapters, usually because the site moved or died. Override the detection when it
			gets a source wrong.
		</p>
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>Source</th>
						<th>Entries</th>
						<th>Stale share</th>
						<th>Median age of newest chapter</th>
						<th>Detected</th>
						<th>Use</th>
					</tr>
				</thead>
				<tbody>
					{#each analysis.sources as source (source.key)}
						<tr>
							<td>{source.name}</td>
							<td>{source.entryCount}</td>
							<td>{Math.round(source.staleShare * 100)}%</td>
							<td>
								{source.medianDaysSinceUpload === null
									? '—'
									: formatAge(analysis.referenceTime - source.medianDaysSinceUpload * DAY, analysis.referenceTime)}
							</td>
							<td>{source.detectedFrozen ? 'Frozen' : 'Updating'}</td>
							<td>
								<select
									value={source.key in settings.frozenSourceOverrides
										? settings.frozenSourceOverrides[source.key]
											? 'frozen'
											: 'updating'
										: 'auto'}
									onchange={(event) => setOverride(source.key, event.currentTarget.value)}
								>
									<option value="auto">Automatic</option>
									<option value="frozen">Frozen</option>
									<option value="updating">Updating</option>
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.threshold {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 110px;
		gap: 12px;
		align-items: center;
	}
</style>
