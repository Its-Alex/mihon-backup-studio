import type { BackupDocument, Manga } from './model';

export const DAY = 86_400_000;

export interface AnalysisSettings {
	activeDays: number;
	silentDays: number;
	frozenSourceDays: number;
	frozenSourceShare: number;
	frozenSourceMinEntries: number;
	notStartedMaxRead: number;
	frozenSourceOverrides: Record<string, boolean>;
}

export const defaultSettings: AnalysisSettings = {
	activeDays: 60,
	silentDays: 365,
	frozenSourceDays: 500,
	frozenSourceShare: 0.5,
	frozenSourceMinEntries: 10,
	notStartedMaxRead: 2,
	frozenSourceOverrides: {}
};

export const groups = {
	active: { label: 'Active', hint: 'read recently', color: 'var(--c-green)' },
	caughtUpUpdating: {
		label: 'Caught up · source updating',
		hint: 'a new chapter appeared recently',
		color: 'var(--c-blue)'
	},
	caughtUpSilent: {
		label: 'Caught up · source silent',
		hint: 'ended, on hiatus or stalled: check it yourself',
		color: 'var(--c-teal)'
	},
	caughtUpFrozen: {
		label: 'Caught up · frozen source',
		hint: 'the source stopped updating; the series may continue elsewhere',
		color: 'var(--c-purple)'
	},
	behind: { label: 'Behind', hint: 'unread chapters, not read recently', color: 'var(--c-orange)' },
	behindFrozen: {
		label: 'Behind · frozen source',
		hint: 'progress stuck on a source that no longer updates',
		color: 'var(--c-red)'
	},
	notStarted: { label: 'Not started', hint: 'barely opened', color: 'var(--c-yellow)' },
	notStartedFrozen: { label: 'Not started · frozen source', hint: '', color: 'var(--c-pink)' },
	duplicate: {
		label: 'Duplicate',
		hint: 'another library entry has the same title and more progress',
		color: 'var(--c-cyan)'
	},
	extensionMissing: {
		label: 'Extension missing',
		hint: 'source not installed when the backup was made',
		color: 'var(--c-gray)'
	},
	notInLibrary: {
		label: 'Not in library',
		hint: 'older copies kept for their reading progress',
		color: 'var(--c-muted)'
	}
} as const;

export type Group = keyof typeof groups;

export interface EntryInsight {
	manga: Manga;
	sourceName: string;
	extensionMissing: boolean;
	frozenSource: boolean;
	readCount: number;
	chapterCount: number;
	unreadCount: number;
	caughtUp: boolean;
	ownLastRead: number | null;
	lastRead: number | null;
	lastReadRecovered: boolean;
	readDuration: number;
	lastUpload: number | null;
	normalizedTitle: string;
	group: Group;
}

export interface SourceInsight {
	key: string;
	name: string;
	installed: boolean;
	entryCount: number;
	libraryCount: number;
	staleShare: number;
	medianDaysSinceUpload: number | null;
	detectedFrozen: boolean;
	frozen: boolean;
}

export interface Analysis {
	referenceTime: number;
	entries: EntryInsight[];
	byUid: Map<string, EntryInsight>;
	sources: SourceInsight[];
}

export const normalizeTitle = (title: string) =>
	title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/\([^)]*\)|\[[^\]]*]/g, '')
		.replace(/\bthe\b/g, '')
		.replace(/[^a-z0-9]/g, '');

const median = (values: number[]) => {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
};

// The newest timestamp in the backup stands in for "now", so an old backup is judged as of when it was made.
function findReferenceTime(document: BackupDocument): number {
	let latest = 0;
	for (const manga of document.mangas) {
		for (const entry of manga.history) latest = Math.max(latest, entry.lastRead);
		for (const chapter of manga.chapters) latest = Math.max(latest, chapter.dateFetch);
	}
	return latest || Date.now();
}

export function analyze(document: BackupDocument, settings: AnalysisSettings): Analysis {
	const referenceTime = findReferenceTime(document);
	const daysAgo = (time: number | null) => (time ? (referenceTime - time) / DAY : Infinity);

	const latestHistoryByTitle = new Map<string, number>();
	const base = document.mangas.map((manga) => {
		let readCount = 0;
		let maxChapter = -1;
		let maxReadChapter = -1;
		let lastUpload = 0;
		for (const chapter of manga.chapters) {
			if (chapter.read) {
				readCount++;
				maxReadChapter = Math.max(maxReadChapter, chapter.chapterNumber);
			}
			maxChapter = Math.max(maxChapter, chapter.chapterNumber);
			lastUpload = Math.max(lastUpload, chapter.dateUpload);
		}
		const ownLastRead =
			manga.history.reduce((latest, entry) => Math.max(latest, entry.lastRead), 0) || null;
		const normalizedTitle = normalizeTitle(manga.title);
		if (ownLastRead) {
			latestHistoryByTitle.set(
				normalizedTitle,
				Math.max(latestHistoryByTitle.get(normalizedTitle) ?? 0, ownLastRead)
			);
		}
		const chapterCount = manga.chapters.length;
		const unreadCount = chapterCount - readCount;
		return {
			manga,
			readCount,
			chapterCount,
			unreadCount,
			caughtUp:
				chapterCount > 0 && (unreadCount <= 1 || (maxChapter >= 0 && maxReadChapter >= maxChapter)),
			ownLastRead,
			readDuration: manga.history.reduce((total, entry) => total + entry.readDuration, 0),
			lastUpload: lastUpload || null,
			normalizedTitle
		};
	});

	const sourceStats = new Map<
		string,
		{ total: number; library: number; stale: number; ages: number[] }
	>();
	for (const entry of base) {
		const stats = sourceStats.get(entry.manga.sourceKey) ?? {
			total: 0,
			library: 0,
			stale: 0,
			ages: []
		};
		stats.total++;
		if (entry.manga.favorite) stats.library++;
		// Copies left outside the library stop refreshing, so only library entries say whether a source still updates.
		if (entry.manga.favorite && entry.lastUpload) {
			const age = daysAgo(entry.lastUpload);
			stats.ages.push(age);
			if (age > settings.frozenSourceDays) stats.stale++;
		}
		sourceStats.set(entry.manga.sourceKey, stats);
	}
	const sources: SourceInsight[] = [...sourceStats].map(([key, stats]) => {
		const name = document.sourceNames.get(key) ?? '';
		const staleShare = stats.ages.length ? stats.stale / stats.ages.length : 0;
		const detectedFrozen =
			stats.ages.length >= settings.frozenSourceMinEntries &&
			staleShare >= settings.frozenSourceShare;
		return {
			key,
			name: name || `Unknown source ${key}`,
			installed: !!name,
			entryCount: stats.total,
			libraryCount: stats.library,
			staleShare,
			medianDaysSinceUpload: median(stats.ages),
			detectedFrozen,
			frozen: settings.frozenSourceOverrides[key] ?? detectedFrozen
		};
	});
	const nameCounts = new Map<string, number>();
	for (const source of sources) nameCounts.set(source.name, (nameCounts.get(source.name) ?? 0) + 1);
	for (const source of sources) {
		if (source.installed && nameCounts.get(source.name)! > 1) source.name = `${source.name} (#${source.key.slice(-4)})`;
	}
	sources.sort((a, b) => b.libraryCount - a.libraryCount || b.entryCount - a.entryCount);
	const sourceByKey = new Map(sources.map((source) => [source.key, source]));

	const libraryByTitle = new Map<string, typeof base>();
	for (const entry of base) {
		if (!entry.manga.favorite || !entry.normalizedTitle) continue;
		const list = libraryByTitle.get(entry.normalizedTitle) ?? [];
		list.push(entry);
		libraryByTitle.set(entry.normalizedTitle, list);
	}
	const duplicateUids = new Set<string>();
	for (const list of libraryByTitle.values()) {
		if (list.length < 2) continue;
		const [, ...others] = [...list].sort(
			(a, b) => b.readCount - a.readCount || (b.ownLastRead ?? 0) - (a.ownLastRead ?? 0)
		);
		for (const other of others) duplicateUids.add(other.manga.uid);
	}

	const entries: EntryInsight[] = base.map((entry) => {
		const source = sourceByKey.get(entry.manga.sourceKey)!;
		const recovered = latestHistoryByTitle.get(entry.normalizedTitle) ?? null;
		const lastRead = Math.max(entry.ownLastRead ?? 0, recovered ?? 0) || null;
		const frozenSource = source.frozen;
		const silentDays = daysAgo(entry.lastUpload);
		let group: Group;
		if (!entry.manga.favorite) group = 'notInLibrary';
		else if (duplicateUids.has(entry.manga.uid)) group = 'duplicate';
		else if (!source.installed) group = 'extensionMissing';
		else if (daysAgo(lastRead) <= settings.activeDays) group = 'active';
		else if (entry.caughtUp)
			group = frozenSource
				? 'caughtUpFrozen'
				: silentDays <= settings.silentDays
					? 'caughtUpUpdating'
					: 'caughtUpSilent';
		else if (entry.readCount <= settings.notStartedMaxRead)
			group = frozenSource ? 'notStartedFrozen' : 'notStarted';
		else group = frozenSource ? 'behindFrozen' : 'behind';
		return {
			...entry,
			sourceName: source.name,
			extensionMissing: !source.installed,
			frozenSource,
			lastRead,
			lastReadRecovered: !!lastRead && lastRead !== entry.ownLastRead,
			group
		};
	});

	return {
		referenceTime,
		entries,
		byUid: new Map(entries.map((entry) => [entry.manga.uid, entry])),
		sources
	};
}

export function formatAge(time: number | null, referenceTime: number): string {
	if (!time) return 'unknown';
	const days = Math.max(0, Math.round((referenceTime - time) / DAY));
	if (days < 1) return 'today';
	if (days < 60) return `${days} d`;
	if (days < 730) return `${Math.round(days / 30)} mo`;
	return `${(days / 365).toFixed(1)} yr`;
}
