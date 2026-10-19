import {
	WireType,
	decodeFields,
	decodeFloat32,
	decodePackedVarints,
	decodeString,
	encodeFields,
	encodeString,
	keyToVarint,
	varintToKey,
	varintToNumber,
	type Field,
	type VarintValue
} from '../proto/wire';

// Field numbers mirror mihon's backup models:
// https://github.com/mihonapp/mihon/tree/main/app/src/main/java/eu/kanade/tachiyomi/data/backup/models
const BackupField = { manga: 1, category: 2, source: 101 } as const;
const MangaField = {
	source: 1,
	url: 2,
	title: 3,
	artist: 4,
	author: 5,
	description: 6,
	genre: 7,
	status: 8,
	thumbnailUrl: 9,
	dateAdded: 13,
	chapters: 16,
	categories: 17,
	tracking: 18,
	favorite: 100,
	history: 104,
	notes: 110
} as const;
const ChapterField = {
	url: 1,
	name: 2,
	scanlator: 3,
	read: 4,
	bookmark: 5,
	lastPageRead: 6,
	dateFetch: 7,
	dateUpload: 8,
	chapterNumber: 9
} as const;
const CategoryField = { name: 1, order: 2, id: 3, flags: 100 } as const;
const HistoryField = { url: 1, lastRead: 2, readDuration: 3 } as const;
const TrackingField = {
	syncId: 1,
	trackingUrl: 4,
	title: 5,
	lastChapterRead: 6,
	totalChapters: 7,
	score: 8,
	status: 9,
	startedReadingDate: 10,
	finishedReadingDate: 11,
	mediaId: 100
} as const;

export const MangaStatus = {
	0: 'Unknown',
	1: 'Ongoing',
	2: 'Completed',
	3: 'Licensed',
	4: 'Publishing finished',
	5: 'Cancelled',
	6: 'On hiatus'
} as const satisfies Record<number, string>;

let nextUid = 1;
const newUid = (prefix: string) => `${prefix}${nextUid++}`;

const varintField = (number: number, value: VarintValue): Field => ({
	number,
	wireType: WireType.Varint,
	value
});
const bytesField = (number: number, value: Uint8Array): Field => ({
	number,
	wireType: WireType.LengthDelimited,
	value
});
const stringField = (number: number, value: string) => bytesField(number, encodeString(value));

function replaceFields(fields: Field[], number: number, replacement: Field[]): Field[] {
	const firstIndex = fields.findIndex((field) => field.number === number);
	const kept = fields.filter((field) => field.number !== number);
	const insertAt =
		firstIndex === -1
			? kept.length
			: fields.slice(0, firstIndex).filter((field) => field.number !== number).length;
	kept.splice(insertAt, 0, ...replacement);
	return kept;
}

const optionalString = (number: number, value: string | null | undefined) =>
	value ? [stringField(number, value)] : [];

export class Chapter {
	url = '';
	name = '';
	scanlator: string | null = null;
	read = false;
	bookmark = false;
	lastPageRead = 0;
	dateFetch = 0;
	dateUpload = 0;
	chapterNumber = -1;
	dirty = false;

	constructor(public bytes: Uint8Array) {
		for (const field of decodeFields(bytes)) {
			switch (field.number) {
				case ChapterField.url:
					this.url = decodeString(field.value as Uint8Array);
					break;
				case ChapterField.name:
					this.name = decodeString(field.value as Uint8Array);
					break;
				case ChapterField.scanlator:
					this.scanlator = decodeString(field.value as Uint8Array);
					break;
				case ChapterField.read:
					this.read = field.value !== 0;
					break;
				case ChapterField.bookmark:
					this.bookmark = field.value !== 0;
					break;
				case ChapterField.lastPageRead:
					this.lastPageRead = varintToNumber(field.value as VarintValue);
					break;
				case ChapterField.dateFetch:
					this.dateFetch = varintToNumber(field.value as VarintValue);
					break;
				case ChapterField.dateUpload:
					this.dateUpload = varintToNumber(field.value as VarintValue);
					break;
				case ChapterField.chapterNumber:
					this.chapterNumber = decodeFloat32(field.value as Uint8Array);
					break;
			}
		}
	}

	setRead(read: boolean) {
		if (this.read === read) return;
		this.read = read;
		if (!read) this.lastPageRead = 0;
		this.dirty = true;
	}

	encode(): Uint8Array {
		if (!this.dirty) return this.bytes;
		let fields = decodeFields(this.bytes);
		fields = replaceFields(
			fields,
			ChapterField.read,
			this.read ? [varintField(ChapterField.read, 1)] : []
		);
		fields = replaceFields(
			fields,
			ChapterField.bookmark,
			this.bookmark ? [varintField(ChapterField.bookmark, 1)] : []
		);
		fields = replaceFields(
			fields,
			ChapterField.lastPageRead,
			this.lastPageRead ? [varintField(ChapterField.lastPageRead, this.lastPageRead)] : []
		);
		return encodeFields(fields);
	}
}

export interface HistoryEntry {
	url: string;
	lastRead: number;
	readDuration: number;
	bytes: Uint8Array;
}

function decodeHistory(bytes: Uint8Array): HistoryEntry {
	const entry: HistoryEntry = { url: '', lastRead: 0, readDuration: 0, bytes };
	for (const field of decodeFields(bytes)) {
		if (field.number === HistoryField.url) entry.url = decodeString(field.value as Uint8Array);
		else if (field.number === HistoryField.lastRead)
			entry.lastRead = varintToNumber(field.value as VarintValue);
		else if (field.number === HistoryField.readDuration)
			entry.readDuration = varintToNumber(field.value as VarintValue);
	}
	return entry;
}

export interface Tracking {
	syncId: number;
	trackingUrl: string;
	title: string;
	lastChapterRead: number;
	totalChapters: number;
	score: number;
	status: number;
	startedReadingDate: number;
	finishedReadingDate: number;
	mediaId: number;
}

function decodeTracking(bytes: Uint8Array): Tracking {
	const tracking: Tracking = {
		syncId: 0,
		trackingUrl: '',
		title: '',
		lastChapterRead: 0,
		totalChapters: 0,
		score: 0,
		status: 0,
		startedReadingDate: 0,
		finishedReadingDate: 0,
		mediaId: 0
	};
	for (const field of decodeFields(bytes)) {
		switch (field.number) {
			case TrackingField.syncId:
				tracking.syncId = varintToNumber(field.value as VarintValue);
				break;
			case TrackingField.trackingUrl:
				tracking.trackingUrl = decodeString(field.value as Uint8Array);
				break;
			case TrackingField.title:
				tracking.title = decodeString(field.value as Uint8Array);
				break;
			case TrackingField.lastChapterRead:
				if (field.wireType === WireType.Fixed32)
					tracking.lastChapterRead = decodeFloat32(field.value);
				break;
			case TrackingField.totalChapters:
				tracking.totalChapters = varintToNumber(field.value as VarintValue);
				break;
			case TrackingField.score:
				if (field.wireType === WireType.Fixed32) tracking.score = decodeFloat32(field.value);
				break;
			case TrackingField.status:
				tracking.status = varintToNumber(field.value as VarintValue);
				break;
			case TrackingField.startedReadingDate:
				tracking.startedReadingDate = varintToNumber(field.value as VarintValue);
				break;
			case TrackingField.finishedReadingDate:
				tracking.finishedReadingDate = varintToNumber(field.value as VarintValue);
				break;
			case TrackingField.mediaId:
				tracking.mediaId = varintToNumber(field.value as VarintValue);
				break;
		}
	}
	return tracking;
}

export class Category {
	uid = newUid('category-');
	name = '';
	order = 0;
	id = 0;
	flags: VarintValue = 0;
	dirty = false;

	constructor(public bytes: Uint8Array | null) {
		if (!bytes) return;
		for (const field of decodeFields(bytes)) {
			if (field.number === CategoryField.name) this.name = decodeString(field.value as Uint8Array);
			else if (field.number === CategoryField.order)
				this.order = varintToNumber(field.value as VarintValue);
			else if (field.number === CategoryField.id)
				this.id = varintToNumber(field.value as VarintValue);
			else if (field.number === CategoryField.flags) this.flags = field.value as VarintValue;
		}
	}

	encode(): Uint8Array {
		if (!this.dirty && this.bytes) return this.bytes;
		let fields = this.bytes ? decodeFields(this.bytes) : [];
		fields = replaceFields(fields, CategoryField.name, [
			stringField(CategoryField.name, this.name)
		]);
		fields = replaceFields(
			fields,
			CategoryField.order,
			this.order ? [varintField(CategoryField.order, this.order)] : []
		);
		fields = replaceFields(
			fields,
			CategoryField.id,
			this.id ? [varintField(CategoryField.id, this.id)] : []
		);
		return encodeFields(fields);
	}
}

export interface NewMangaInput {
	sourceKey: string;
	url: string;
	title: string;
	categoryUids: string[];
}

export class Manga {
	uid = newUid('manga-');
	sourceKey = '0';
	url = '';
	title = '';
	artist: string | null = null;
	author: string | null = null;
	description: string | null = null;
	genres: string[] = [];
	status = 0;
	thumbnailUrl: string | null = null;
	dateAdded = 0;
	favorite = true;
	notes = '';
	tracking: Tracking[] = [];
	chapters: Chapter[] = [];
	history: HistoryEntry[] = [];
	originalCategoryOrders: number[] = [];
	categoryUids: string[] = [];
	metadataDirty = false;
	historyDirty = false;

	constructor(public bytes: Uint8Array | null) {
		if (!bytes) return;
		for (const field of decodeFields(bytes)) {
			const raw = field.value;
			switch (field.number) {
				case MangaField.source:
					this.sourceKey = varintToKey(raw as VarintValue);
					break;
				case MangaField.url:
					this.url = decodeString(raw as Uint8Array);
					break;
				case MangaField.title:
					this.title = decodeString(raw as Uint8Array);
					break;
				case MangaField.artist:
					this.artist = decodeString(raw as Uint8Array);
					break;
				case MangaField.author:
					this.author = decodeString(raw as Uint8Array);
					break;
				case MangaField.description:
					this.description = decodeString(raw as Uint8Array);
					break;
				case MangaField.genre:
					this.genres.push(decodeString(raw as Uint8Array));
					break;
				case MangaField.status:
					this.status = varintToNumber(raw as VarintValue);
					break;
				case MangaField.thumbnailUrl:
					this.thumbnailUrl = decodeString(raw as Uint8Array);
					break;
				case MangaField.dateAdded:
					this.dateAdded = varintToNumber(raw as VarintValue);
					break;
				case MangaField.chapters:
					this.chapters.push(new Chapter(raw as Uint8Array));
					break;
				case MangaField.categories:
					if (field.wireType === WireType.LengthDelimited) {
						this.originalCategoryOrders.push(
							...decodePackedVarints(raw as Uint8Array).map(varintToNumber)
						);
					} else {
						this.originalCategoryOrders.push(varintToNumber(raw as VarintValue));
					}
					break;
				case MangaField.tracking:
					this.tracking.push(decodeTracking(raw as Uint8Array));
					break;
				case MangaField.favorite:
					this.favorite = raw !== 0;
					break;
				case MangaField.history:
					this.history.push(decodeHistory(raw as Uint8Array));
					break;
				case MangaField.notes:
					this.notes = decodeString(raw as Uint8Array);
					break;
			}
		}
	}

	static create(input: NewMangaInput): Manga {
		const manga = new Manga(null);
		manga.sourceKey = input.sourceKey;
		manga.url = input.url;
		manga.title = input.title;
		manga.categoryUids = [...input.categoryUids];
		manga.dateAdded = Date.now();
		manga.metadataDirty = true;
		return manga;
	}

	get chaptersDirty() {
		return this.chapters.some((chapter) => chapter.dirty);
	}

	encode(orderByCategoryUid: Map<string, number>): Uint8Array {
		const categoryOrders = this.categoryUids
			.map((uid) => orderByCategoryUid.get(uid))
			.filter((order): order is number => order !== undefined);
		const categoriesChanged =
			categoryOrders.length !== this.originalCategoryOrders.length ||
			categoryOrders.some((order, index) => order !== this.originalCategoryOrders[index]);
		const chaptersDirty = this.chaptersDirty;
		if (
			this.bytes &&
			!this.metadataDirty &&
			!this.historyDirty &&
			!categoriesChanged &&
			!chaptersDirty
		) {
			return this.bytes;
		}
		let fields: Field[] = this.bytes ? decodeFields(this.bytes) : [];
		if (!this.bytes || this.metadataDirty) {
			fields = replaceFields(fields, MangaField.source, [
				varintField(MangaField.source, keyToVarint(this.sourceKey))
			]);
			fields = replaceFields(fields, MangaField.url, [stringField(MangaField.url, this.url)]);
			fields = replaceFields(
				fields,
				MangaField.title,
				optionalString(MangaField.title, this.title)
			);
			fields = replaceFields(
				fields,
				MangaField.artist,
				optionalString(MangaField.artist, this.artist)
			);
			fields = replaceFields(
				fields,
				MangaField.author,
				optionalString(MangaField.author, this.author)
			);
			fields = replaceFields(
				fields,
				MangaField.description,
				optionalString(MangaField.description, this.description)
			);
			fields = replaceFields(
				fields,
				MangaField.status,
				this.status ? [varintField(MangaField.status, this.status)] : []
			);
			fields = replaceFields(
				fields,
				MangaField.dateAdded,
				this.dateAdded ? [varintField(MangaField.dateAdded, this.dateAdded)] : []
			);
			fields = replaceFields(
				fields,
				MangaField.favorite,
				this.favorite ? [] : [varintField(MangaField.favorite, 0)]
			);
			fields = replaceFields(
				fields,
				MangaField.notes,
				optionalString(MangaField.notes, this.notes)
			);
		}
		if (categoriesChanged || !this.bytes) {
			fields = replaceFields(
				fields,
				MangaField.categories,
				categoryOrders.map((order) => varintField(MangaField.categories, order))
			);
		}
		if (chaptersDirty) {
			fields = replaceFields(
				fields,
				MangaField.chapters,
				this.chapters.map((chapter) => bytesField(MangaField.chapters, chapter.encode()))
			);
		}
		if (this.historyDirty) {
			fields = replaceFields(
				fields,
				MangaField.history,
				this.history.map((entry) => bytesField(MangaField.history, entry.bytes))
			);
		}
		return encodeFields(fields);
	}
}

type LayoutItem = { kind: 'manga' } | { kind: 'category' } | { kind: 'other'; field: Field };

export class BackupDocument {
	mangas: Manga[] = [];
	categories: Category[] = [];
	sourceNames = new Map<string, string>();
	private layout: LayoutItem[] = [];
	categoriesReordered = false;

	static decode(bytes: Uint8Array): BackupDocument {
		const document = new BackupDocument();
		let sawManga = false;
		let sawCategory = false;
		for (const field of decodeFields(bytes)) {
			if (field.number === BackupField.manga && field.wireType === WireType.LengthDelimited) {
				document.mangas.push(new Manga(field.value));
				if (!sawManga) document.layout.push({ kind: 'manga' });
				sawManga = true;
				continue;
			}
			if (field.number === BackupField.category && field.wireType === WireType.LengthDelimited) {
				document.categories.push(new Category(field.value));
				if (!sawCategory) document.layout.push({ kind: 'category' });
				sawCategory = true;
				continue;
			}
			if (field.number === BackupField.source && field.wireType === WireType.LengthDelimited) {
				let name = '';
				let key = '';
				for (const sourceField of decodeFields(field.value)) {
					if (sourceField.number === 1) name = decodeString(sourceField.value as Uint8Array);
					if (sourceField.number === 2) key = varintToKey(sourceField.value as VarintValue);
				}
				if (key) document.sourceNames.set(key, name);
			}
			document.layout.push({ kind: 'other', field });
		}
		if (!sawManga) document.layout.unshift({ kind: 'manga' });
		if (!sawCategory) document.layout.push({ kind: 'category' });

		const categoryByOrder = new Map(
			document.categories.map((category) => [category.order, category])
		);
		const missingCategoryUid = new Map<number, string>();
		for (const manga of document.mangas) {
			manga.categoryUids = manga.originalCategoryOrders.map((order) => {
				const category = categoryByOrder.get(order);
				if (category) return category.uid;
				if (!missingCategoryUid.has(order))
					missingCategoryUid.set(order, `missing-category-${order}`);
				return missingCategoryUid.get(order)!;
			});
		}
		return document;
	}

	categoryOrderMap(): Map<string, number> {
		const map = new Map<string, number>();
		for (const category of this.categories) map.set(category.uid, category.order);
		for (const manga of this.mangas) {
			for (const uid of manga.categoryUids) {
				if (uid.startsWith('missing-category-'))
					map.set(uid, Number(uid.slice('missing-category-'.length)));
			}
		}
		return map;
	}

	normalizeCategoryOrders() {
		this.categories.forEach((category, index) => {
			if (category.order !== index) {
				category.order = index;
				category.dirty = true;
			}
		});
	}

	encode(): Uint8Array {
		const orderMap = this.categoryOrderMap();
		const output: Field[] = [];
		for (const item of this.layout) {
			if (item.kind === 'manga') {
				for (const manga of this.mangas)
					output.push(bytesField(BackupField.manga, manga.encode(orderMap)));
			} else if (item.kind === 'category') {
				for (const category of this.categories)
					output.push(bytesField(BackupField.category, category.encode()));
			} else {
				output.push(item.field);
			}
		}
		return encodeFields(output);
	}
}
