import { DAY, type Analysis, type EntryInsight, type Group } from './analysis';

export type CleanupAction = 'removeFromLibrary' | 'moveToCategory' | 'deleteFromBackup';

export const actionLabels: Record<CleanupAction, string> = {
	removeFromLibrary: 'Remove from library',
	moveToCategory: 'Move to category',
	deleteFromBackup: 'Delete from backup'
};

export interface CleanupOptions {
	abandonedDays: number;
	dailyCategoryUid: string | null;
}

export interface Suggestion {
	id: string;
	title: string;
	description: string;
	actions: CleanupAction[];
	selectedByDefault: boolean;
	entries: EntryInsight[];
}

const byGroup = (analysis: Analysis, group: Group) =>
	analysis.entries.filter((entry) => entry.group === group);

export function buildSuggestions(analysis: Analysis, options: CleanupOptions): Suggestion[] {
	const libraryTitles = new Set(
		analysis.entries.filter((entry) => entry.manga.favorite).map((entry) => entry.normalizedTitle)
	);
	const abandonedBefore = analysis.referenceTime - options.abandonedDays * DAY;
	const notInLibrary = byGroup(analysis, 'notInLibrary');

	const suggestions: Suggestion[] = [
		{
			id: 'duplicates',
			title: 'Duplicates',
			description:
				'Library entries whose title matches another library entry with more chapters read. The entry with the most progress stays.',
			actions: ['removeFromLibrary', 'deleteFromBackup'],
			selectedByDefault: true,
			entries: byGroup(analysis, 'duplicate')
		},
		{
			id: 'extension-missing',
			title: 'Extension missing',
			description:
				'The source was not installed when the backup was made, so these entries cannot update.',
			actions: ['removeFromLibrary', 'deleteFromBackup'],
			selectedByDefault: true,
			entries: byGroup(analysis, 'extensionMissing')
		},
		{
			id: 'frozen-not-started',
			title: 'Not started, on a frozen source',
			description:
				'Barely opened and the source stopped updating. Migrate the ones you still want, remove the rest.',
			actions: ['removeFromLibrary'],
			selectedByDefault: true,
			entries: byGroup(analysis, 'notStartedFrozen')
		},
		{
			id: 'frozen-behind',
			title: 'Behind, on a frozen source',
			description:
				'Progress is stuck on a source that no longer gets chapters. Migrate the ones you still follow.',
			actions: ['removeFromLibrary', 'moveToCategory'],
			selectedByDefault: true,
			entries: byGroup(analysis, 'behindFrozen')
		},
		{
			id: 'abandoned',
			title: `Abandoned (not read for ${options.abandonedDays}+ days)`,
			description:
				'Started, unread chapters left, and no reading since. Unknown dates count as abandoned.',
			actions: ['removeFromLibrary', 'moveToCategory'],
			selectedByDefault: true,
			entries: byGroup(analysis, 'behind').filter(
				(entry) => (entry.lastRead ?? 0) < abandonedBefore
			)
		},
		{
			id: 'caught-up-silent',
			title: 'Caught up, nothing new for a long time',
			description:
				'The source status is ignored on purpose: check each one, then file the finished ones.',
			actions: ['moveToCategory', 'removeFromLibrary'],
			selectedByDefault: false,
			entries: [...byGroup(analysis, 'caughtUpSilent'), ...byGroup(analysis, 'caughtUpFrozen')]
		}
	];

	if (options.dailyCategoryUid) {
		const uid = options.dailyCategoryUid;
		suggestions.push({
			id: 'daily-inactive',
			title: 'Not daily reads anymore',
			description: 'In your daily category but neither active nor caught up on an updating source.',
			actions: ['moveToCategory', 'removeFromLibrary'],
			selectedByDefault: true,
			entries: analysis.entries.filter(
				(entry) =>
					entry.manga.favorite &&
					entry.manga.categoryUids.includes(uid) &&
					entry.group !== 'active' &&
					entry.group !== 'caughtUpUpdating'
			)
		});
	}

	suggestions.push(
		{
			id: 'empty-copies',
			title: 'Empty copies outside the library',
			description: 'Not in the library, nothing read and no history: they carry no information.',
			actions: ['deleteFromBackup'],
			selectedByDefault: true,
			entries: notInLibrary.filter((entry) => entry.readCount === 0 && !entry.manga.history.length)
		},
		{
			id: 'history-copies',
			title: 'Old copies holding history',
			description:
				'Not in the library but share a title with a library entry, usually left behind by a migration. Their history feeds the recovered “last read” dates: deleting them loses it.',
			actions: ['deleteFromBackup'],
			selectedByDefault: false,
			entries: notInLibrary.filter(
				(entry) =>
					libraryTitles.has(entry.normalizedTitle) &&
					(entry.readCount > 0 || entry.manga.history.length > 0)
			)
		}
	);

	return suggestions.filter((suggestion) => suggestion.entries.length > 0);
}
