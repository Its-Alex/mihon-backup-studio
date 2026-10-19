import { groups, type EntryInsight, type Group } from './analysis';
import type { BackupDocument, Manga } from './model';

export const DEFAULT_CATEGORY = 'default';

export const libraryGroups = (Object.keys(groups) as Group[]).filter(
	(group) => group !== 'notInLibrary'
);

export interface CategoryBucket {
	uid: string;
	name: string;
	entries: EntryInsight[];
}

export function libraryByCategory(
	document: BackupDocument,
	entries: EntryInsight[]
): CategoryBucket[] {
	const library = entries.filter((entry) => entry.manga.favorite);
	const buckets: CategoryBucket[] = document.categories.map((category) => ({
		uid: category.uid,
		name: category.name,
		entries: library.filter((entry) => entry.manga.categoryUids.includes(category.uid))
	}));
	const known = new Set(document.categories.map((category) => category.uid));
	const uncategorized = library.filter(
		(entry) => !entry.manga.categoryUids.some((uid) => known.has(uid))
	);
	if (uncategorized.length)
		buckets.unshift({
			uid: DEFAULT_CATEGORY,
			name: 'Default (no category)',
			entries: uncategorized
		});
	return buckets;
}

export interface GenreStat {
	key: string;
	label: string;
	count: number;
}

export function genreStats(entries: EntryInsight[]): GenreStat[] {
	const stats = new Map<string, GenreStat>();
	for (const entry of entries) {
		const seen = new Set<string>();
		for (const genre of entry.manga.genres) {
			const label = genre.trim();
			const key = label.toLowerCase();
			if (!label || seen.has(key)) continue;
			seen.add(key);
			const stat = stats.get(key) ?? { key, label, count: 0 };
			stat.count++;
			stats.set(key, stat);
		}
	}
	return [...stats.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export const hasGenre = (manga: Manga, key: string) =>
	manga.genres.some((genre) => genre.trim().toLowerCase() === key);

export function groupSegments(entries: EntryInsight[]) {
	return libraryGroups.map((group) => ({
		key: group,
		label: groups[group].label,
		color: groups[group].color,
		count: entries.filter((entry) => entry.group === group).length
	}));
}
