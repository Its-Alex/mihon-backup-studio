import { groups, type EntryInsight, type Group } from './analysis';
import type { BackupDocument } from './model';

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

export function groupSegments(entries: EntryInsight[]) {
	return libraryGroups.map((group) => ({
		key: group,
		label: groups[group].label,
		color: groups[group].color,
		count: entries.filter((entry) => entry.group === group).length
	}));
}
