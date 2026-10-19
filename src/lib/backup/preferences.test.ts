import { describe, expect, it } from 'vitest';
import { WireType, encodeFields, encodeString, type Field } from '../proto/wire';
import { decodePreference } from './preferences';

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

const preference = (key: string, serialName: string, payload: Field[]) =>
	encodeFields([text(1, key), message(2, [text(1, serialName), message(2, payload)])]);

const serial = (kind: string) => `eu.kanade.tachiyomi.data.backup.models.${kind}PreferenceValue`;

describe('decodePreference', () => {
	it('decodes booleans', () => {
		expect(decodePreference(preference('swipe', serial('Boolean'), [varint(1, 1)]))).toEqual({
			key: 'swipe',
			type: 'Boolean',
			value: 'true'
		});
		expect(decodePreference(preference('swipe', serial('Boolean'), [])).value).toBe('false');
	});

	it('decodes numbers and strings', () => {
		expect(decodePreference(preference('columns', serial('Int'), [varint(1, 3)]))).toEqual({
			key: 'columns',
			type: 'Int',
			value: '3'
		});
		expect(decodePreference(preference('theme', serial('String'), [text(1, 'dark')])).value).toBe(
			'dark'
		);
	});

	it('decodes string sets', () => {
		const decoded = decodePreference(
			preference('langs', serial('StringSet'), [text(1, 'en'), text(1, 'fr')])
		);
		expect(decoded).toEqual({ key: 'langs', type: 'StringSet', value: 'en, fr' });
	});

	it('labels unknown value types without failing', () => {
		const decoded = decodePreference(preference('odd', 'some.Other', [varint(1, 7)]));
		expect(decoded.type).toBe('Other');
		expect(decoded.value).toBe('1 value(s)');
	});
});
