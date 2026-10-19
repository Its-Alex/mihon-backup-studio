/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WireType, decodeFields, encodeFields, encodeString, type Field } from '../proto/wire';
import { readBackupBytes } from './gzip';
import { analyze, defaultSettings } from './analysis';
import { BackupDocument, Manga } from './model';

const text = (number: number, value: string): Field => ({
	number,
	wireType: WireType.LengthDelimited,
	value: encodeString(value)
});
const varint = (number: number, value: number | bigint): Field => ({
	number,
	wireType: WireType.Varint,
	value
});
const message = (number: number, fields: Field[]): Field => ({
	number,
	wireType: WireType.LengthDelimited,
	value: encodeFields(fields)
});
const float32 = (number: number, value: number): Field => {
	const bytes = new Uint8Array(4);
	new DataView(bytes.buffer).setFloat32(0, value, true);
	return { number, wireType: WireType.Fixed32, value: bytes };
};

const largeSourceId = 6247824327199706550n;

function sampleBackup(): Uint8Array {
	return encodeFields([
		message(1, [
			varint(1, largeSourceId),
			text(2, '/manga/a'),
			text(3, 'Alpha'),
			message(16, [text(1, '/a/1'), text(2, 'Chapter 1'), varint(4, 1)]),
			message(16, [text(1, '/a/2'), text(2, 'Chapter 2')]),
			varint(17, 0),
			message(18, [
				varint(1, 1),
				text(4, 'https://myanimelist.net/manga/42'),
				text(5, 'Alpha'),
				float32(6, 12),
				varint(7, 100),
				float32(8, 10),
				varint(9, 1),
				varint(100, 42)
			]),
			message(104, [text(1, '/a/1'), varint(2, 1_700_000_000_000)]),
			varint(999, 42)
		]),
		message(1, [varint(1, 2), text(2, '/manga/b'), text(3, 'Beta'), varint(17, 1), varint(100, 0)]),
		message(2, [text(1, 'Daily')]),
		message(2, [text(1, 'Later'), varint(2, 1), varint(3, 1)]),
		message(101, [text(1, 'Big Source'), varint(2, largeSourceId)]),
		message(104, [text(1, 'some_preference')]),
		message(105, [text(1, 'source_2'), message(2, [text(1, 'a_source_preference')])])
	]);
}

describe('BackupDocument', () => {
	it('re-encodes an untouched backup byte for byte', () => {
		const bytes = sampleBackup();
		expect(BackupDocument.decode(bytes).encode()).toEqual(bytes);
	});

	it('keeps 64-bit source ids exact', () => {
		const document = BackupDocument.decode(sampleBackup());
		expect(document.mangas[0].sourceKey).toBe(largeSourceId.toString());
		expect(document.sourceNames.get(largeSourceId.toString())).toBe('Big Source');
		document.mangas[0].title = 'Alpha renamed';
		document.mangas[0].metadataDirty = true;
		expect(BackupDocument.decode(document.encode()).mangas[0].sourceKey).toBe(
			largeSourceId.toString()
		);
	});

	it('remaps entry categories when categories are reordered', () => {
		const document = BackupDocument.decode(sampleBackup());
		document.categories.reverse();
		document.normalizeCategoryOrders();
		const reloaded = BackupDocument.decode(document.encode());
		const nameOf = (manga: Manga) =>
			manga.categoryUids.map(
				(uid) => reloaded.categories.find((category) => category.uid === uid)?.name
			);
		expect(nameOf(reloaded.mangas[0])).toEqual(['Daily']);
		expect(nameOf(reloaded.mangas[1])).toEqual(['Later']);
	});

	it('persists library, chapter and history edits while keeping unknown fields', () => {
		const document = BackupDocument.decode(sampleBackup());
		const alpha = document.mangas[0];
		alpha.favorite = false;
		alpha.metadataDirty = true;
		alpha.chapters[1].setRead(true);
		alpha.history = [];
		alpha.historyDirty = true;
		const reloaded = BackupDocument.decode(document.encode());
		expect(reloaded.mangas[0].favorite).toBe(false);
		expect(reloaded.mangas[0].chapters.map((chapter) => chapter.read)).toEqual([true, true]);
		expect(reloaded.mangas[0].history).toEqual([]);
		expect(reloaded.mangas[1].favorite).toBe(false);
		expect(
			decodeFields(reloaded.mangas[0].bytes!).find((field) => field.number === 999)?.value
		).toBe(42);
	});

	it('decodes tracker bindings', () => {
		const document = BackupDocument.decode(sampleBackup());
		expect(document.mangas[0].tracking).toEqual([
			{
				syncId: 1,
				trackingUrl: 'https://myanimelist.net/manga/42',
				title: 'Alpha',
				lastChapterRead: 12,
				totalChapters: 100,
				score: 10,
				status: 1,
				startedReadingDate: 0,
				finishedReadingDate: 0,
				mediaId: 42
			}
		]);
		expect(document.mangas[1].tracking).toEqual([]);
	});

	it('strips preferences and filters entries when asked', () => {
		const document = BackupDocument.decode(sampleBackup());
		const trimmed = BackupDocument.decode(
			document.encode({
				includeAppPreferences: false,
				includeSourcePreferences: false,
				includeManga: (manga) => manga.title !== 'Beta'
			})
		);
		expect(trimmed.mangas.map((manga) => manga.title)).toEqual(['Alpha']);
		expect(trimmed.otherFieldValues(104)).toEqual([]);
		expect(trimmed.otherFieldValues(105)).toEqual([]);
		expect(trimmed.categories.length).toBe(2);
		expect(trimmed.sourceNames.get(largeSourceId.toString())).toBe('Big Source');
	});

	it('writes new entries and categories', () => {
		const document = BackupDocument.decode(sampleBackup());
		const created = Manga.create({
			sourceKey: '2',
			url: '/manga/c',
			title: 'Gamma',
			categoryUids: [document.categories[1].uid]
		});
		document.mangas.push(created);
		const reloaded = BackupDocument.decode(document.encode());
		const gamma = reloaded.mangas[2];
		expect(gamma.title).toBe('Gamma');
		expect(gamma.favorite).toBe(true);
		expect(
			reloaded.categories.find((category) => category.uid === gamma.categoryUids[0])?.name
		).toBe('Later');
	});
});

const realBackupPath = process.env.MIHON_BACKUP;
describe.runIf(realBackupPath)('real backup', () => {
	it('round-trips without changing a byte', async () => {
		const bytes = await readBackupBytes(new Uint8Array(readFileSync(realBackupPath!)));
		const document = BackupDocument.decode(bytes);
		expect(document.mangas.length).toBeGreaterThan(0);
		expect(Buffer.compare(document.encode(), bytes)).toBe(0);
	});

	it('keeps edits and category membership across an export', async () => {
		const bytes = await readBackupBytes(new Uint8Array(readFileSync(realBackupPath!)));
		const document = BackupDocument.decode(bytes);
		const categoryNamesOf = (doc: BackupDocument, manga: Manga) =>
			manga.categoryUids.map((uid) => doc.categories.find((category) => category.uid === uid)?.name);
		const before = document.mangas.map((manga) => [manga.url, categoryNamesOf(document, manga)]);
		document.categories.reverse();
		document.normalizeCategoryOrders();
		const removed = document.mangas.find((manga) => manga.favorite)!;
		removed.favorite = false;
		removed.categoryUids = [];
		removed.metadataDirty = true;

		const reloaded = BackupDocument.decode(document.encode());
		const after = reloaded.mangas.map((manga) => [manga.url, categoryNamesOf(reloaded, manga)]);
		const removedIndex = document.mangas.indexOf(removed);
		expect(after.filter((_, index) => index !== removedIndex)).toEqual(
			before.filter((_, index) => index !== removedIndex)
		);
		expect(reloaded.mangas[removedIndex].favorite).toBe(false);
		expect(reloaded.mangas[removedIndex].categoryUids).toEqual([]);
		const analysis = analyze(reloaded, defaultSettings);
		expect(analysis.entries.filter((entry) => entry.manga.favorite).length).toBe(
			document.mangas.filter((manga) => manga.favorite).length
		);
	});
});
