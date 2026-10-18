<script lang="ts">
	import { formatAge, groups } from '#lib/backup/analysis.ts';
	import { MangaStatus } from '#lib/backup/model.ts';
	import { studio } from '#lib/studio.svelte.ts';

	const chapterPreview = 60;

	const insight = $derived(studio.openEntryUid ? studio.analysis?.byUid.get(studio.openEntryUid) : undefined);
	const currentManga = $derived(insight?.manga);
	const referenceTime = $derived(studio.analysis?.referenceTime ?? Date.now());
	const categories = $derived.by(() => {
		void studio.version;
		return [...(studio.document?.categories ?? [])];
	});
	const otherCopies = $derived(
		insight
			? (studio.analysis?.entries ?? []).filter(
					(other) => other.normalizedTitle === insight.normalizedTitle && other.manga.uid !== insight.manga.uid
				)
			: []
	);

	let title = $state('');
	let author = $state('');
	let artist = $state('');
	let status = $state(0);
	let notes = $state('');
	let description = $state('');
	let showAllChapters = $state(false);

	$effect(() => {
		const current = studio.openEntryUid ? studio.document?.mangas.find((entry) => entry.uid === studio.openEntryUid) : undefined;
		if (!current) return;
		title = current.title;
		author = current.author ?? '';
		artist = current.artist ?? '';
		status = current.status;
		notes = current.notes;
		description = current.description ?? '';
		showAllChapters = false;
	});

	// Entries are mutated in place, so read them through `insight`, which is a fresh object after every edit.
	const metadataChanged = $derived.by(() => {
		const manga = insight?.manga;
		return (
			!!manga &&
			(title !== manga.title ||
				author !== (manga.author ?? '') ||
				artist !== (manga.artist ?? '') ||
				status !== manga.status ||
				notes !== manga.notes ||
				description !== (manga.description ?? ''))
		);
	});
	const chapters = $derived(
		insight?.manga.chapters.map((chapter, index) => ({
			index,
			name: chapter.name,
			read: chapter.read,
			dateUpload: chapter.dateUpload
		})) ?? []
	);

	function saveMetadata() {
		const manga = currentManga;
		if (!manga) return;
		studio.updateMetadata(manga.uid, {
			title,
			author: author || null,
			artist: artist || null,
			status,
			notes,
			description: description || null
		});
	}

	function toggleCategory(uid: string, checked: boolean) {
		const manga = currentManga;
		if (!manga) return;
		const next = checked ? [...manga.categoryUids, uid] : manga.categoryUids.filter((existing) => existing !== uid);
		studio.setCategories([manga.uid], next, `Changed categories of “${manga.title}”`);
	}

	const allIndexes = () => currentManga?.chapters.map((_, index) => index) ?? [];
	const close = () => (studio.openEntryUid = null);
</script>

<svelte:window onkeydown={(event) => event.key === 'Escape' && close()} />

{#if insight}
	{@const manga = insight.manga}
	{@const visibleChapters = showAllChapters ? chapters : chapters.slice(0, chapterPreview)}
	<div class="overlay" role="presentation" onclick={close}></div>
	<aside class="drawer" aria-label="Entry details">
		<header class="row">
			<h2>{manga.title || '(untitled)'}</h2>
			<button class="close" onclick={close} aria-label="Close">✕</button>
		</header>

		<div class="body stack">
			<div class="row">
				<span class="tag"><span class="dot" style:background={groups[insight.group].color}></span>{groups[insight.group].label}</span>
				<span class="tag">{insight.sourceName}</span>
				{#if manga.trackingCount}<span class="tag">{manga.trackingCount} tracker(s)</span>{/if}
			</div>
			<dl class="facts">
				<dt>Read</dt>
				<dd>{insight.readCount} / {insight.chapterCount} chapters</dd>
				<dt>Last read</dt>
				<dd>
					{formatAge(insight.lastRead, referenceTime)}
					{#if insight.lastReadRecovered}<span class="muted small">(from another copy)</span>{/if}
				</dd>
				<dt>Newest chapter</dt>
				<dd>{formatAge(insight.lastUpload, referenceTime)}</dd>
				<dt>Added</dt>
				<dd>{manga.dateAdded ? new Date(manga.dateAdded).toLocaleDateString() : 'unknown'}</dd>
				<dt>URL</dt>
				<dd class="small break">{manga.url}</dd>
			</dl>

			<section class="stack">
				<h3>Library</h3>
				<label class="row">
					<input type="checkbox" checked={manga.favorite} onchange={(event) => studio.setInLibrary([manga.uid], event.currentTarget.checked)} />
					In library
				</label>
				<div class="row">
					{#each categories as category (category.uid)}
						<label class="row small chip">
							<input
								type="checkbox"
								checked={manga.categoryUids.includes(category.uid)}
								disabled={!manga.favorite}
								onchange={(event) => toggleCategory(category.uid, event.currentTarget.checked)}
							/>
							{category.name}
						</label>
					{/each}
				</div>
			</section>

			<section class="stack">
				<h3>Details</h3>
				<label class="stack field">Title <input bind:value={title} /></label>
				<div class="row">
					<label class="stack field grow">Author <input bind:value={author} /></label>
					<label class="stack field grow">Artist <input bind:value={artist} /></label>
				</div>
				<label class="stack field">
					Status
					<select bind:value={status}>
						{#each Object.entries(MangaStatus) as [value, label] (value)}
							<option value={Number(value)}>{label}</option>
						{/each}
					</select>
				</label>
				<label class="stack field">Notes <textarea rows="2" bind:value={notes}></textarea></label>
				<label class="stack field">Description <textarea rows="4" bind:value={description}></textarea></label>
				<p class="muted small">
					Restoring over an existing library keeps the app's own title and details; these edits apply on a fresh restore.
				</p>
				<div class="row"><button class="primary" disabled={!metadataChanged} onclick={saveMetadata}>Save details</button></div>
			</section>

			<section class="stack">
				<div class="row" style="justify-content: space-between">
					<h3>Chapters</h3>
					<div class="row">
						<button class="small" onclick={() => studio.setChaptersRead(manga.uid, allIndexes(), true)}>All read</button>
						<button class="small" onclick={() => studio.setChaptersRead(manga.uid, allIndexes(), false)}>All unread</button>
					</div>
				</div>
				<div class="chapters">
					{#each visibleChapters as chapter (chapter.index)}
						<div class="chapter" class:read={chapter.read}>
							<input
								type="checkbox"
								checked={chapter.read}
								onchange={(event) => studio.setChaptersRead(manga.uid, [chapter.index], event.currentTarget.checked)}
								aria-label="Read"
							/>
							<span class="name" title={chapter.name}>{chapter.name}</span>
							<span class="muted small">{chapter.dateUpload ? new Date(chapter.dateUpload).toLocaleDateString() : ''}</span>
							<button
								class="link small"
								title="Mark this chapter and every chapter listed below it as read"
								onclick={() =>
									studio.setChaptersRead(
										manga.uid,
										allIndexes().filter((other) => other >= chapter.index),
										true
									)}>read to here</button
							>
						</div>
					{/each}
				</div>
				{#if manga.chapters.length > chapterPreview && !showAllChapters}
					<button class="link small" onclick={() => (showAllChapters = true)}>Show all {manga.chapters.length} chapters</button>
				{/if}
			</section>

			<section class="stack">
				<div class="row" style="justify-content: space-between">
					<h3>Reading history</h3>
					<button class="small danger" disabled={!manga.history.length} onclick={() => studio.clearHistory(manga.uid)}>Clear</button>
				</div>
				<p class="small">
					{manga.history.length} chapters with history · {(insight.readDuration / 3_600_000).toFixed(1)} h recorded
				</p>
			</section>

			{#if otherCopies.length}
				<section class="stack">
					<h3>Other copies of this title</h3>
					{#each otherCopies as copy (copy.manga.uid)}
						<button class="link row small" onclick={() => (studio.openEntryUid = copy.manga.uid)}>
							{copy.sourceName} · {copy.manga.favorite ? 'in library' : 'not in library'} · {copy.readCount}/{copy.chapterCount}
							read · last read {formatAge(copy.manga.history.reduce((latest, entry) => Math.max(latest, entry.lastRead), 0) || null, referenceTime)}
						</button>
					{/each}
				</section>
			{/if}

			<section class="row">
				<button
					class="danger"
					onclick={() => {
						if (confirm(`Delete “${manga.title}” from the backup, with its chapters and history?`)) {
							studio.deleteEntries([manga.uid]);
							close();
						}
					}}>Delete entry from backup</button
				>
			</section>
		</div>
	</aside>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 10;
		background: rgb(0 0 0 / 0.3);
	}

	.drawer {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		z-index: 11;
		width: min(560px, 100vw);
		display: flex;
		flex-direction: column;
		background: var(--panel);
		border-left: 1px solid var(--border);
		box-shadow: -8px 0 24px rgb(0 0 0 / 0.2);
	}

	header {
		justify-content: space-between;
		flex-wrap: nowrap;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	.close {
		border: none;
		background: none;
		font-size: 16px;
	}

	.body {
		overflow-y: auto;
		padding: 16px 20px 32px;
		gap: 20px;
	}

	h3 {
		font-size: 14px;
	}

	.facts {
		display: grid;
		grid-template-columns: 120px 1fr;
		gap: 4px 12px;
		margin: 0;
	}

	.facts dt {
		color: var(--muted);
	}

	.facts dd {
		margin: 0;
	}

	.break {
		word-break: break-all;
	}

	.field {
		gap: 4px;
	}

	.grow {
		flex: 1;
	}

	.chip {
		background: var(--panel-2);
		border-radius: 999px;
		padding: 3px 10px 3px 6px;
		gap: 4px;
	}

	.chapters {
		max-height: 360px;
		overflow-y: auto;
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.chapter {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto auto;
		gap: 8px;
		align-items: center;
		padding: 4px 10px;
		border-bottom: 1px solid var(--border);
	}

	.chapter.read .name {
		color: var(--muted);
	}

	.name {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
