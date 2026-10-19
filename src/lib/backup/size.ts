import { WireType, decodeFields, varintByteLength, type Field } from '../proto/wire';
import { BackupField, MangaField, type BackupDocument } from './model';

export interface EntrySize {
	uid: string;
	title: string;
	inLibrary: boolean;
	total: number;
	chapters: number;
	history: number;
	tracking: number;
	details: number;
	chapterCount: number;
	historyCount: number;
}

export interface SizeBreakdown {
	total: number;
	libraryEntries: number;
	outsideEntries: number;
	chapters: number;
	history: number;
	tracking: number;
	details: number;
	categories: number;
	sources: number;
	appPreferences: number;
	sourcePreferences: number;
	other: number;
	entries: EntrySize[];
}

function fieldSize(field: Field): number {
	const header = varintByteLength(field.number * 8 + field.wireType);
	if (field.wireType === WireType.Varint) return header + varintByteLength(field.value);
	if (field.wireType === WireType.LengthDelimited)
		return header + varintByteLength(field.value.length) + field.value.length;
	return header + field.value.length;
}

export function measureBackup(document: BackupDocument): SizeBreakdown {
	const bytes = document.encode();
	const breakdown: SizeBreakdown = {
		total: bytes.length,
		libraryEntries: 0,
		outsideEntries: 0,
		chapters: 0,
		history: 0,
		tracking: 0,
		details: 0,
		categories: 0,
		sources: 0,
		appPreferences: 0,
		sourcePreferences: 0,
		other: 0,
		entries: []
	};
	let mangaIndex = 0;
	for (const field of decodeFields(bytes)) {
		const size = fieldSize(field);
		if (field.number === BackupField.manga && field.wireType === WireType.LengthDelimited) {
			const manga = document.mangas[mangaIndex++];
			const entry: EntrySize = {
				uid: manga.uid,
				title: manga.title,
				inLibrary: manga.favorite,
				total: size,
				chapters: 0,
				history: 0,
				tracking: 0,
				details: 0,
				chapterCount: manga.chapters.length,
				historyCount: manga.history.length
			};
			for (const sub of decodeFields(field.value)) {
				const subSize = fieldSize(sub);
				if (sub.number === MangaField.chapters) entry.chapters += subSize;
				else if (sub.number === MangaField.history) entry.history += subSize;
				else if (sub.number === MangaField.tracking) entry.tracking += subSize;
			}
			entry.details = entry.total - entry.chapters - entry.history - entry.tracking;
			breakdown.entries.push(entry);
			if (entry.inLibrary) breakdown.libraryEntries += size;
			else breakdown.outsideEntries += size;
			breakdown.chapters += entry.chapters;
			breakdown.history += entry.history;
			breakdown.tracking += entry.tracking;
			breakdown.details += entry.details;
		} else if (field.number === BackupField.category) breakdown.categories += size;
		else if (field.number === BackupField.source) breakdown.sources += size;
		else if (field.number === BackupField.appPreferences) breakdown.appPreferences += size;
		else if (field.number === BackupField.sourcePreferences) breakdown.sourcePreferences += size;
		else breakdown.other += size;
	}
	breakdown.entries.sort((a, b) => b.total - a.total);
	return breakdown;
}

export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
}

export const shareOf = (part: number, total: number) =>
	total ? `${((100 * part) / total).toFixed(1)}%` : '0%';
