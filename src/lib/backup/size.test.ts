import { describe, expect, it } from 'vitest';
import { WireType, encodeFields, encodeString, type Field } from '../proto/wire';
import { BackupDocument } from './model';
import { formatBytes, measureBackup } from './size';

const text = (number: number, value: string): Field => ({
	number,
	wireType: WireType.LengthDelimited,
	value: encodeString(value)
});
const varint = (number: number, value: number): Field => ({
	number,
	wireType: WireType.Varint,
	value
});
const message = (number: number, fields: Field[]): Field => ({
	number,
	wireType: WireType.LengthDelimited,
	value: encodeFields(fields)
});

const sample = () =>
	encodeFields([
		message(1, [
			varint(1, 1),
			text(2, '/manga/a'),
			text(3, 'Alpha'),
			message(16, [text(1, '/a/1'), text(2, 'Chapter 1'), varint(4, 1)]),
			message(16, [text(1, '/a/2'), text(2, 'Chapter 2')]),
			message(18, [varint(1, 1), text(4, 'https://tracker/42')]),
			message(104, [text(1, '/a/1'), varint(2, 1_700_000_000_000)])
		]),
		message(1, [varint(1, 2), text(2, '/manga/b'), text(3, 'Beta'), varint(100, 0)]),
		message(2, [text(1, 'Daily')]),
		message(101, [text(1, 'Source'), varint(2, 1)]),
		message(104, [text(1, 'some_preference')]),
		message(105, [text(1, 'source_2')]),
		message(106, [text(1, 'https://repo')])
	]);

describe('measureBackup', () => {
	it('accounts for every byte of the encoded backup', () => {
		const bytes = sample();
		const document = BackupDocument.decode(bytes);
		const breakdown = measureBackup(document);
		expect(breakdown.total).toBe(bytes.length);
		expect(
			breakdown.libraryEntries +
				breakdown.outsideEntries +
				breakdown.categories +
				breakdown.sources +
				breakdown.appPreferences +
				breakdown.sourcePreferences +
				breakdown.other
		).toBe(breakdown.total);
	});

	it('splits each entry into chapters, history, tracking and details', () => {
		const breakdown = measureBackup(BackupDocument.decode(sample()));
		const [alpha, beta] = [...breakdown.entries].sort((a, b) => a.title.localeCompare(b.title));
		expect(alpha.title).toBe('Alpha');
		expect(alpha.inLibrary).toBe(true);
		expect(alpha.chapters).toBeGreaterThan(0);
		expect(alpha.history).toBeGreaterThan(0);
		expect(alpha.tracking).toBeGreaterThan(0);
		expect(alpha.chapters + alpha.history + alpha.tracking + alpha.details).toBe(alpha.total);
		expect(alpha.chapterCount).toBe(2);
		expect(beta.inLibrary).toBe(false);
		expect(beta.details).toBe(beta.total);
		expect(breakdown.entries[0].total).toBeGreaterThanOrEqual(breakdown.entries[1].total);
		expect(breakdown.chapters).toBe(alpha.chapters);
		expect(breakdown.outsideEntries).toBe(beta.total);
	});
});

describe('formatBytes', () => {
	it('picks a readable unit', () => {
		expect(formatBytes(512)).toBe('512 B');
		expect(formatBytes(2048)).toBe('2.0 KB');
		expect(formatBytes(3 * 1024 * 1024)).toBe('3.00 MB');
	});
});
