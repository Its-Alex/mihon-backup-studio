import type { EntryInsight } from './analysis';
import { MangaStatus, type Manga, type Tracking } from './model';

// Tracker ids mirror mihon's TrackerManager.
const trackerNames: Record<number, string> = {
	1: 'MyAnimeList',
	2: 'AniList',
	3: 'Kitsu',
	4: 'Shikimori',
	5: 'Bangumi',
	6: 'Komga',
	7: 'MangaUpdates',
	8: 'Kavita',
	9: 'Suwayomi'
};

export const trackerName = (syncId: number) => trackerNames[syncId] ?? `Tracker #${syncId}`;

export const MYANIMELIST_SYNC_ID = 1;

// MyAnimeList's own status codes, used as-is by mihon's MAL tracker.
const malStatusNames: Record<number, string> = {
	1: 'Reading',
	2: 'Completed',
	3: 'On-Hold',
	4: 'Dropped',
	6: 'Plan to Read'
};

export function maxReadChapterNumber(manga: Manga): number {
	let max = 0;
	for (const chapter of manga.chapters)
		if (chapter.read && chapter.chapterNumber > max) max = chapter.chapterNumber;
	return Math.floor(max);
}

export interface MalExportItem {
	mediaId: number;
	readChapters: number;
	status: number;
	score: number;
}

export function malExportItems(entries: EntryInsight[]): MalExportItem[] {
	const byMediaId = new Map<number, MalExportItem>();
	for (const entry of entries) {
		for (const tracking of entry.manga.tracking) {
			if (tracking.syncId !== MYANIMELIST_SYNC_ID || !tracking.mediaId) continue;
			const readChapters = Math.max(
				Math.floor(tracking.lastChapterRead),
				maxReadChapterNumber(entry.manga)
			);
			const existing = byMediaId.get(tracking.mediaId);
			if (existing && existing.readChapters >= readChapters) continue;
			byMediaId.set(tracking.mediaId, {
				mediaId: tracking.mediaId,
				readChapters,
				status: tracking.status,
				score: tracking.score
			});
		}
	}
	return [...byMediaId.values()].sort((a, b) => a.mediaId - b.mediaId);
}

export function buildMalXml(items: MalExportItem[]): string {
	const blocks = items.map((item) =>
		[
			'\t<manga>',
			`\t\t<manga_mangadb_id>${item.mediaId}</manga_mangadb_id>`,
			`\t\t<my_read_chapters>${item.readChapters}</my_read_chapters>`,
			`\t\t<my_score>${Math.round(item.score)}</my_score>`,
			`\t\t<my_status>${malStatusNames[item.status] ?? 'Reading'}</my_status>`,
			'\t\t<update_on_import>1</update_on_import>',
			'\t</manga>'
		].join('\n')
	);
	return [
		'<?xml version="1.0" encoding="UTF-8" ?>',
		'<myanimelist>',
		'\t<myinfo>',
		'\t\t<user_export_type>2</user_export_type>',
		'\t</myinfo>',
		...blocks,
		'</myanimelist>',
		''
	].join('\n');
}

const csvCell = (value: string | number) => {
	const text = String(value);
	return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export function buildLibraryCsv(entries: EntryInsight[]): string {
	const header = ['Title', 'Author', 'Source', 'Status', 'Read chapters', 'Total chapters', 'Last read'];
	const rows = entries.map((entry) =>
		[
			entry.manga.title,
			entry.manga.author ?? '',
			entry.sourceName,
			MangaStatus[entry.manga.status as keyof typeof MangaStatus] ?? String(entry.manga.status),
			maxReadChapterNumber(entry.manga) || entry.readCount,
			entry.chapterCount,
			entry.lastRead ? new Date(entry.lastRead).toISOString().slice(0, 10) : ''
		]
			.map(csvCell)
			.join(',')
	);
	return [header.join(','), ...rows, ''].join('\n');
}

export const trackingProgress = (tracking: Tracking) =>
	`${Math.floor(tracking.lastChapterRead)} / ${tracking.totalChapters || '?'}`;
