import { describe, expect, it } from 'vitest';
import type { EntryInsight } from './analysis';
import { Manga, type Tracking } from './model';
import { buildMalXml, malExportItems, trackerName } from './trackers';

const tracking = (overrides: Partial<Tracking>): Tracking => ({
	syncId: 1,
	trackingUrl: '',
	title: '',
	lastChapterRead: 0,
	totalChapters: 0,
	score: 0,
	status: 1,
	startedReadingDate: 0,
	finishedReadingDate: 0,
	mediaId: 0,
	...overrides
});

const entryWith = (trackings: Tracking[]): EntryInsight => {
	const manga = Manga.create({ sourceKey: '1', url: '/a', title: 'Alpha', categoryUids: [] });
	manga.tracking = trackings;
	return { manga } as EntryInsight;
};

describe('malExportItems', () => {
	it('keeps only MyAnimeList bindings with an id, deduplicated on the best progress', () => {
		const entries = [
			entryWith([tracking({ mediaId: 42, lastChapterRead: 12.5, score: 10 })]),
			entryWith([tracking({ mediaId: 42, lastChapterRead: 8 })]),
			entryWith([tracking({ syncId: 2, mediaId: 7 })]),
			entryWith([tracking({ mediaId: 0 })])
		];
		expect(malExportItems(entries)).toEqual([
			{ mediaId: 42, readChapters: 12, status: 1, score: 10 }
		]);
	});
});

describe('buildMalXml', () => {
	it('produces a MAL manga import document', () => {
		const xml = buildMalXml([{ mediaId: 42, readChapters: 12, status: 2, score: 9.5 }]);
		expect(xml).toContain('<user_export_type>2</user_export_type>');
		expect(xml).toContain('<manga_mangadb_id>42</manga_mangadb_id>');
		expect(xml).toContain('<my_read_chapters>12</my_read_chapters>');
		expect(xml).toContain('<my_status>Completed</my_status>');
		expect(xml).toContain('<my_score>10</my_score>');
	});
});

describe('trackerName', () => {
	it('names known trackers and falls back to the id', () => {
		expect(trackerName(1)).toBe('MyAnimeList');
		expect(trackerName(7)).toBe('MangaUpdates');
		expect(trackerName(99)).toBe('Tracker #99');
	});
});
