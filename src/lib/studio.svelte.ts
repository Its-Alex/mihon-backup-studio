import { analyze, defaultSettings, type AnalysisSettings } from './backup/analysis';
import { gzip, readBackupBytes } from './backup/gzip';
import { BackupDocument, Category, Manga, type NewMangaInput } from './backup/model';

const settingsKey = 'mihon-backup-studio:settings';
const coversKey = 'mihon-backup-studio:covers';

function loadSettings(): AnalysisSettings {
	try {
		const stored = globalThis.localStorage?.getItem(settingsKey);
		if (stored) return { ...structuredClone(defaultSettings), ...JSON.parse(stored) };
	} catch {
		// Unavailable or corrupt storage falls back to defaults.
	}
	return structuredClone(defaultSettings);
}

export interface MetadataPatch {
	title?: string;
	author?: string | null;
	artist?: string | null;
	description?: string | null;
	status?: number;
	notes?: string;
}

class Studio {
	document = $state.raw<BackupDocument | null>(null);
	fileName = $state('');
	loading = $state(false);
	error = $state('');
	version = $state(0);
	changes = $state<string[]>([]);
	openEntryUid = $state<string | null>(null);
	settings = $state<AnalysisSettings>(loadSettings());
	showCovers = $state(globalThis.localStorage?.getItem(coversKey) === 'on');
	private originalBytes: Uint8Array | null = null;

	analysis = $derived.by(() => {
		void this.version;
		return this.document
			? analyze(this.document, $state.snapshot(this.settings) as AnalysisSettings)
			: null;
	});

	async load(file: File) {
		this.loading = true;
		this.error = '';
		try {
			const bytes = await readBackupBytes(new Uint8Array(await file.arrayBuffer()));
			const document = BackupDocument.decode(bytes);
			this.originalBytes = bytes;
			this.document = document;
			this.fileName = file.name;
			this.changes = [];
			this.version++;
		} catch (error) {
			this.error = `Could not read this backup: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			this.loading = false;
		}
	}

	reset() {
		if (!this.originalBytes) return;
		this.document = BackupDocument.decode(this.originalBytes);
		this.changes = [];
		this.version++;
	}

	close() {
		this.document = null;
		this.originalBytes = null;
		this.fileName = '';
		this.changes = [];
		this.openEntryUid = null;
	}

	saveSettings() {
		localStorage.setItem(settingsKey, JSON.stringify($state.snapshot(this.settings)));
		this.version++;
	}

	setShowCovers(show: boolean) {
		this.showCovers = show;
		localStorage.setItem(coversKey, show ? 'on' : 'off');
	}

	private mutate(description: string, apply: (document: BackupDocument) => void) {
		if (!this.document) return;
		apply(this.document);
		this.changes.push(description);
		this.version++;
	}

	private mangas(uids: Iterable<string>): Manga[] {
		const wanted = new Set(uids);
		return this.document?.mangas.filter((manga) => wanted.has(manga.uid)) ?? [];
	}

	category(uid: string) {
		return this.document?.categories.find((category) => category.uid === uid);
	}

	categoryName(uid: string) {
		return (
			this.category(uid)?.name ?? `Missing category (${uid.replace('missing-category-', '#')})`
		);
	}

	addCategory(name: string) {
		this.mutate(`Created category “${name}”`, (document) => {
			const category = new Category(null);
			category.name = name;
			category.id = Math.max(0, ...document.categories.map((existing) => existing.id)) + 1;
			category.order = document.categories.length;
			category.dirty = true;
			document.categories.push(category);
			document.normalizeCategoryOrders();
		});
	}

	renameCategory(uid: string, name: string) {
		const category = this.category(uid);
		if (!category || category.name === name) return;
		this.mutate(`Renamed category “${category.name}” to “${name}”`, () => {
			category.name = name;
			category.dirty = true;
		});
	}

	moveCategory(uid: string, offset: number) {
		this.mutate(`Reordered categories`, (document) => {
			const index = document.categories.findIndex((category) => category.uid === uid);
			const target = index + offset;
			if (index < 0 || target < 0 || target >= document.categories.length) return;
			const [category] = document.categories.splice(index, 1);
			document.categories.splice(target, 0, category);
			document.normalizeCategoryOrders();
		});
	}

	deleteCategory(uid: string, moveEntriesTo: string | null) {
		const category = this.category(uid);
		if (!category) return;
		const destination = moveEntriesTo
			? ` (entries moved to “${this.categoryName(moveEntriesTo)}”)`
			: '';
		this.mutate(`Deleted category “${category.name}”${destination}`, (document) => {
			for (const manga of document.mangas) {
				if (!manga.categoryUids.includes(uid)) continue;
				manga.categoryUids = manga.categoryUids.filter((existing) => existing !== uid);
				if (moveEntriesTo && !manga.categoryUids.includes(moveEntriesTo))
					manga.categoryUids.push(moveEntriesTo);
			}
			document.categories = document.categories.filter((existing) => existing.uid !== uid);
			document.normalizeCategoryOrders();
		});
	}

	setCategories(uids: Iterable<string>, categoryUids: string[], label?: string) {
		const mangas = this.mangas(uids);
		const names = categoryUids.map((uid) => this.categoryName(uid)).join(', ') || 'Default';
		this.mutate(label ?? `Set ${mangas.length} entries to ${names}`, () => {
			for (const manga of mangas) manga.categoryUids = [...categoryUids];
		});
	}

	addToCategory(uids: Iterable<string>, categoryUid: string) {
		const mangas = this.mangas(uids);
		this.mutate(`Added ${mangas.length} entries to “${this.categoryName(categoryUid)}”`, () => {
			for (const manga of mangas)
				if (!manga.categoryUids.includes(categoryUid)) manga.categoryUids.push(categoryUid);
		});
	}

	removeFromCategory(uids: Iterable<string>, categoryUid: string) {
		const mangas = this.mangas(uids);
		this.mutate(`Removed ${mangas.length} entries from “${this.categoryName(categoryUid)}”`, () => {
			for (const manga of mangas)
				manga.categoryUids = manga.categoryUids.filter((uid) => uid !== categoryUid);
		});
	}

	setInLibrary(uids: Iterable<string>, inLibrary: boolean) {
		const mangas = this.mangas(uids).filter((manga) => manga.favorite !== inLibrary);
		if (!mangas.length) return;
		const verb = inLibrary ? 'Added' : 'Removed';
		this.mutate(`${verb} ${mangas.length} entries ${inLibrary ? 'to' : 'from'} the library`, () => {
			for (const manga of mangas) {
				manga.favorite = inLibrary;
				if (!inLibrary) manga.categoryUids = [];
				manga.metadataDirty = true;
			}
		});
	}

	deleteEntries(uids: Iterable<string>) {
		const doomed = new Set(this.mangas(uids).map((manga) => manga.uid));
		if (!doomed.size) return;
		this.mutate(`Deleted ${doomed.size} entries from the backup`, (document) => {
			document.mangas = document.mangas.filter((manga) => !doomed.has(manga.uid));
		});
	}

	updateMetadata(uid: string, patch: MetadataPatch) {
		const [manga] = this.mangas([uid]);
		if (!manga) return;
		this.mutate(`Edited “${patch.title ?? manga.title}”`, () => {
			Object.assign(manga, patch);
			manga.metadataDirty = true;
		});
	}

	setChaptersRead(uid: string, chapterIndexes: number[], read: boolean) {
		const [manga] = this.mangas([uid]);
		if (!manga) return;
		const chapters = chapterIndexes
			.map((index) => manga.chapters[index])
			.filter((chapter) => chapter && chapter.read !== read);
		if (!chapters.length) return;
		this.mutate(
			`Marked ${chapters.length} chapters of “${manga.title}” as ${read ? 'read' : 'unread'}`,
			() => {
				for (const chapter of chapters) chapter.setRead(read);
			}
		);
	}

	clearHistory(uid: string) {
		const [manga] = this.mangas([uid]);
		if (!manga || !manga.history.length) return;
		this.mutate(`Cleared reading history of “${manga.title}”`, () => {
			manga.history = [];
			manga.historyDirty = true;
		});
	}

	createEntry(input: NewMangaInput): string | null {
		let uid: string | null = null;
		this.mutate(`Created entry “${input.title}”`, (document) => {
			const manga = Manga.create(input);
			uid = manga.uid;
			document.mangas.push(manga);
		});
		return uid;
	}

	async exportBackup(): Promise<Blob> {
		if (!this.document) throw new Error('No backup loaded');
		return new Blob([(await gzip(this.document.encode())) as BlobPart], {
			type: 'application/octet-stream'
		});
	}
}

export const studio = new Studio();
