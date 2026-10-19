import {
	WireType,
	decodeFields,
	decodeFloat32,
	decodeString,
	varintToNumber,
	type VarintValue
} from '../proto/wire';
import { BackupField, type BackupDocument } from './model';

export interface DecodedPreference {
	key: string;
	type: string;
	value: string;
}

export interface SourcePreferences {
	fileName: string;
	sourceName: string | null;
	entries: DecodedPreference[];
}

export interface ExtensionRepo {
	baseUrl: string;
	name: string;
	shortName: string;
	website: string;
	fingerprint: string;
}

function formatValue(type: string, bytes: Uint8Array): string {
	const values = decodeFields(bytes).filter((field) => field.number === 1);
	switch (type) {
		case 'Boolean':
			return values.some((field) => varintToNumber(field.value as VarintValue) !== 0)
				? 'true'
				: 'false';
		case 'Int':
		case 'Long':
			return values.map((field) => String(varintToNumber(field.value as VarintValue))).join(', ');
		case 'Float':
			return values
				.map((field) =>
					field.wireType === WireType.Fixed32 ? String(decodeFloat32(field.value)) : '?'
				)
				.join(', ');
		case 'String':
		case 'StringSet':
			return values.map((field) => decodeString(field.value as Uint8Array)).join(', ');
		default:
			return `${values.length} value(s)`;
	}
}

export function decodePreference(bytes: Uint8Array): DecodedPreference {
	let key = '';
	let serialName = '';
	let payload: Uint8Array | null = null;
	for (const field of decodeFields(bytes)) {
		if (field.number === 1 && field.wireType === WireType.LengthDelimited)
			key = decodeString(field.value);
		else if (field.number === 2 && field.wireType === WireType.LengthDelimited) {
			for (const inner of decodeFields(field.value)) {
				if (inner.number === 1 && inner.wireType === WireType.LengthDelimited)
					serialName = decodeString(inner.value);
				else if (inner.number === 2 && inner.wireType === WireType.LengthDelimited)
					payload = inner.value;
			}
		}
	}
	const type = (serialName.split('.').pop() ?? '').replace('PreferenceValue', '') || 'Unknown';
	return {
		key,
		type,
		value: payload ? formatValue(type, payload) : type === 'Boolean' ? 'false' : ''
	};
}

const byKey = (a: DecodedPreference, b: DecodedPreference) => a.key.localeCompare(b.key);

export function decodeAppPreferences(document: BackupDocument): DecodedPreference[] {
	return document.otherFieldValues(BackupField.appPreferences).map(decodePreference).sort(byKey);
}

export function decodeSourcePreferences(document: BackupDocument): SourcePreferences[] {
	return document
		.otherFieldValues(BackupField.sourcePreferences)
		.map((bytes) => {
			let fileName = '';
			const entries: DecodedPreference[] = [];
			for (const field of decodeFields(bytes)) {
				if (field.number === 1 && field.wireType === WireType.LengthDelimited)
					fileName = decodeString(field.value);
				else if (field.number === 2 && field.wireType === WireType.LengthDelimited)
					entries.push(decodePreference(field.value));
			}
			const sourceKey = fileName.startsWith('source_') ? fileName.slice('source_'.length) : null;
			return {
				fileName,
				sourceName: (sourceKey && document.sourceNames.get(sourceKey)) || null,
				entries: entries.sort(byKey)
			};
		})
		.sort((a, b) => (a.sourceName ?? a.fileName).localeCompare(b.sourceName ?? b.fileName));
}

export function decodeExtensionRepos(document: BackupDocument): ExtensionRepo[] {
	return document.otherFieldValues(BackupField.extensionRepos).map((bytes) => {
		const repo: ExtensionRepo = { baseUrl: '', name: '', shortName: '', website: '', fingerprint: '' };
		for (const field of decodeFields(bytes)) {
			if (field.wireType !== WireType.LengthDelimited) continue;
			const text = decodeString(field.value);
			if (field.number === 1) repo.baseUrl = text;
			else if (field.number === 2) repo.name = text;
			else if (field.number === 3) repo.shortName = text;
			else if (field.number === 4) repo.website = text;
			else if (field.number === 5) repo.fingerprint = text;
		}
		return repo;
	});
}
