<script lang="ts">
	import { DAY } from '#lib/backup/analysis.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const analysis = $derived(studio.analysis!);

	interface Read {
		time: number;
		duration: number;
		uid: string;
		title: string;
		normalizedTitle: string;
		inLibrary: boolean;
	}

	const reads = $derived.by(() => {
		const list: Read[] = [];
		for (const entry of analysis.entries) {
			for (const item of entry.manga.history) {
				if (item.lastRead <= 0) continue;
				list.push({
					time: item.lastRead,
					duration: item.readDuration,
					uid: entry.manga.uid,
					title: entry.manga.title,
					normalizedTitle: entry.normalizedTitle,
					inLibrary: entry.manga.favorite
				});
			}
		}
		return list;
	});

	const dayStart = (time: number) => {
		const date = new Date(time);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	};

	const perDay = $derived.by(() => {
		const map = new Map<number, { count: number; duration: number }>();
		for (const read of reads) {
			const key = dayStart(read.time);
			const stat = map.get(key) ?? { count: 0, duration: 0 };
			stat.count++;
			stat.duration += read.duration;
			map.set(key, stat);
		}
		return map;
	});

	const years = $derived.by(() => {
		const set = new Set<number>();
		for (const read of reads) set.add(new Date(read.time).getFullYear());
		return [...set].sort((a, b) => b - a);
	});

	let selectedYear = $state(0);
	$effect(() => {
		if (!years.includes(selectedYear)) selectedYear = years[0] ?? new Date().getFullYear();
	});

	const streaks = $derived.by(() => {
		const days = [...perDay.keys()].map((key) => Math.round(key / DAY)).sort((a, b) => a - b);
		let longest = 0;
		let run = 0;
		let previous = NaN;
		let lastRun = 0;
		for (const day of days) {
			run = day === previous + 1 ? run + 1 : 1;
			previous = day;
			if (run > longest) longest = run;
			lastRun = run;
		}
		const referenceDay = Math.round(dayStart(analysis.referenceTime) / DAY);
		const current = days.length && referenceDay - days[days.length - 1] <= 1 ? lastRun : 0;
		return { longest, current };
	});

	const totals = $derived.by(() => {
		let duration = 0;
		let busiestDay = 0;
		let busiestDuration = 0;
		for (const [key, stat] of perDay) {
			duration += stat.duration;
			if (stat.duration > busiestDuration) {
				busiestDuration = stat.duration;
				busiestDay = key;
			}
		}
		return {
			hours: duration / 3_600_000,
			activeDays: perDay.size,
			busiestDay,
			busiestHours: busiestDuration / 3_600_000
		};
	});

	const cards = $derived([
		{ label: 'Hours recorded', value: Math.round(totals.hours).toLocaleString() },
		{ label: 'Days with reading', value: totals.activeDays.toLocaleString() },
		{ label: 'Longest streak (days)', value: streaks.longest },
		{ label: 'Current streak (days)', value: streaks.current },
		{
			label: 'Busiest day',
			value: totals.busiestDay
				? `${new Date(totals.busiestDay).toLocaleDateString()} · ${totals.busiestHours.toFixed(1)} h`
				: '—'
		}
	]);

	// GitHub-style heatmap: one column per week, Monday first.
	const heatmap = $derived.by(() => {
		const first = new Date(selectedYear, 0, 1);
		const start = new Date(first);
		start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
		const weeks: { time: number; inYear: boolean; count: number; duration: number; level: number }[][] = [];
		const monthLabels: { week: number; label: string }[] = [];
		let cursor = start;
		let lastMonth = -1;
		while (cursor.getFullYear() <= selectedYear) {
			const week: (typeof weeks)[number] = [];
			for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
				const stat = perDay.get(cursor.getTime());
				const minutes = (stat?.duration ?? 0) / 60_000;
				const level = !stat ? 0 : minutes < 15 ? 1 : minutes < 60 ? 2 : minutes < 180 ? 3 : 4;
				week.push({
					time: cursor.getTime(),
					inYear: cursor.getFullYear() === selectedYear,
					count: stat?.count ?? 0,
					duration: stat?.duration ?? 0,
					level
				});
				cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
			}
			if (week.some((cell) => cell.inYear)) {
				const firstInYear = week.find((cell) => cell.inYear)!;
				const month = new Date(firstInYear.time).getMonth();
				if (month !== lastMonth) {
					monthLabels.push({
						week: weeks.length,
						label: new Date(firstInYear.time).toLocaleDateString(undefined, { month: 'short' })
					});
					lastMonth = month;
				}
				weeks.push(week);
			}
			if (cursor.getFullYear() > selectedYear) break;
		}
		return { weeks, monthLabels };
	});

	const monthly = $derived.by(() => {
		const hours = Array.from({ length: 12 }, () => 0);
		const counts = Array.from({ length: 12 }, () => 0);
		for (const read of reads) {
			const date = new Date(read.time);
			if (date.getFullYear() !== selectedYear) continue;
			hours[date.getMonth()] += read.duration / 3_600_000;
			counts[date.getMonth()]++;
		}
		return { hours, counts, max: Math.max(1, ...hours) };
	});

	const monthNames = Array.from({ length: 12 }, (_, month) =>
		new Date(2000, month, 1).toLocaleDateString(undefined, { month: 'short' })
	);

	const topOfYear = $derived.by(() => {
		const byTitle = new Map<string, { uid: string; title: string; duration: number; count: number; inLibrary: boolean }>();
		for (const read of reads) {
			if (new Date(read.time).getFullYear() !== selectedYear) continue;
			const current = byTitle.get(read.normalizedTitle);
			const preferThis = !current || (read.inLibrary && !current.inLibrary);
			byTitle.set(read.normalizedTitle, {
				uid: preferThis ? read.uid : current!.uid,
				title: preferThis ? read.title : current!.title,
				inLibrary: preferThis ? read.inLibrary : current!.inLibrary,
				duration: (current?.duration ?? 0) + read.duration,
				count: (current?.count ?? 0) + 1
			});
		}
		return [...byTitle.values()].sort((a, b) => b.duration - a.duration || b.count - a.count).slice(0, 10);
	});

	const cellTitle = (cell: { time: number; count: number; duration: number }) =>
		`${new Date(cell.time).toLocaleDateString()}: ${cell.count} chapter${cell.count === 1 ? '' : 's'}${
			cell.duration ? ` · ${(cell.duration / 3_600_000).toFixed(1)} h` : ''
		}`;
</script>

<div class="page">
	<div class="row" style="justify-content: space-between">
		<h1>Activity</h1>
		<span class="muted small">From the reading history in the backup: when a chapter was last read, and for how long.</span>
	</div>

	{#if !reads.length}
		<p class="muted">This backup contains no reading history.</p>
	{:else}
		<div class="cards">
			{#each cards as card (card.label)}
				<div class="panel card">
					<div class="value">{card.value}</div>
					<div class="muted small">{card.label}</div>
				</div>
			{/each}
		</div>

		<section class="panel stack">
			<div class="row" style="justify-content: space-between">
				<h2>Reading days</h2>
				<select bind:value={selectedYear} aria-label="Year">
					{#each years as year (year)}
						<option value={year}>{year}</option>
					{/each}
				</select>
			</div>
			<div class="heatmap-scroll">
				<div class="months" style:grid-template-columns="repeat({heatmap.weeks.length}, 12px)">
					{#each heatmap.monthLabels as month (month.week)}
						<span class="small muted" style:grid-column={month.week + 1}>{month.label}</span>
					{/each}
				</div>
				<div class="heatmap">
					{#each heatmap.weeks as week, weekIndex (weekIndex)}
						<div class="week">
							{#each week as cell (cell.time)}
								{#if cell.inYear}
									<span class="cell level-{cell.level}" title={cellTitle(cell)}></span>
								{:else}
									<span class="cell empty"></span>
								{/if}
							{/each}
						</div>
					{/each}
				</div>
			</div>
			<div class="row small muted" style="gap: 4px">
				Less
				{#each [0, 1, 2, 3, 4] as level (level)}
					<span class="cell level-{level}"></span>
				{/each}
				More — shade follows hours read that day
			</div>
		</section>

		<div class="two">
			<section class="panel stack">
				<h2>Hours read per month · {selectedYear}</h2>
				<svg viewBox="0 0 240 130" class="chart" role="img" aria-label="Hours read per month">
					{#each monthly.hours as hours, month (month)}
						{@const height = (hours / monthly.max) * 100}
						<rect x={month * 20 + 3} y={105 - height} width="14" height={height} rx="2" fill="var(--accent)">
							<title>{monthNames[month]}: {hours.toFixed(1)} h · {monthly.counts[month]} chapters</title>
						</rect>
						<text x={month * 20 + 10} y="122" text-anchor="middle" class="axis">{monthNames[month]}</text>
					{/each}
				</svg>
				<div class="muted small">
					{monthly.counts.reduce((sum, count) => sum + count, 0).toLocaleString()} chapters read in {selectedYear} ·
					{monthly.hours.reduce((sum, hours) => sum + hours, 0).toFixed(0)} h recorded
				</div>
			</section>

			<section class="panel stack">
				<h2>Most read in {selectedYear}</h2>
				<table>
					<tbody>
						{#each topOfYear as item (item.uid)}
							<tr>
								<td><button class="link" onclick={() => (studio.openEntryUid = item.uid)}>{item.title}</button></td>
								<td class="muted small nowrap" style="text-align: right">
									{item.duration ? `${(item.duration / 3_600_000).toFixed(1)} h` : `${item.count} ch`}
								</td>
							</tr>
						{:else}
							<tr><td class="muted">No reading recorded this year.</td></tr>
						{/each}
					</tbody>
				</table>
			</section>
		</div>
	{/if}
</div>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: 12px;
	}

	.value {
		font-size: 24px;
		font-weight: 700;
	}

	.two {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
		gap: 16px;
	}

	.chart {
		width: 100%;
		max-width: 480px;
		height: auto;
	}

	.axis {
		font-size: 9px;
		fill: var(--muted);
	}

	.heatmap-scroll {
		overflow-x: auto;
		padding-bottom: 4px;
	}

	.months {
		display: grid;
		grid-auto-flow: column;
		margin-bottom: 4px;
	}

	.months span {
		white-space: nowrap;
	}

	.heatmap {
		display: flex;
		gap: 2px;
	}

	.week {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.cell {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		background: var(--panel-2);
		flex: none;
	}

	.cell.empty {
		background: transparent;
	}

	.cell.level-1 {
		background: color-mix(in srgb, var(--accent) 30%, var(--panel-2));
	}

	.cell.level-2 {
		background: color-mix(in srgb, var(--accent) 55%, var(--panel-2));
	}

	.cell.level-3 {
		background: color-mix(in srgb, var(--accent) 80%, var(--panel-2));
	}

	.cell.level-4 {
		background: var(--accent);
	}

	.nowrap {
		white-space: nowrap;
	}
</style>
