export const enum WireType {
	Varint = 0,
	Fixed64 = 1,
	LengthDelimited = 2,
	Fixed32 = 5
}

export type VarintValue = number | bigint;

export type Field =
	| { number: number; wireType: WireType.Varint; value: VarintValue }
	| {
			number: number;
			wireType: WireType.Fixed64 | WireType.Fixed32 | WireType.LengthDelimited;
			value: Uint8Array;
	  };

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export function decodeFields(bytes: Uint8Array): Field[] {
	const fields: Field[] = [];
	let position = 0;
	const readVarint = (): VarintValue => {
		let low = 0;
		let shift = 0;
		while (shift < 28) {
			const byte = bytes[position++];
			if (byte === undefined) throw new Error('Truncated varint');
			low |= (byte & 0x7f) << shift;
			if (byte < 0x80) return low >>> 0;
			shift += 7;
		}
		let result = BigInt(low >>> 0);
		let bigShift = 28n;
		for (;;) {
			const byte = bytes[position++];
			if (byte === undefined) throw new Error('Truncated varint');
			result |= BigInt(byte & 0x7f) << bigShift;
			if (byte < 0x80) break;
			bigShift += 7n;
		}
		return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : result;
	};
	while (position < bytes.length) {
		const key = Number(readVarint());
		const number = key >>> 3;
		const wireType = key & 7;
		switch (wireType) {
			case WireType.Varint:
				fields.push({ number, wireType, value: readVarint() });
				break;
			case WireType.Fixed64:
				fields.push({ number, wireType, value: bytes.subarray(position, (position += 8)) });
				break;
			case WireType.Fixed32:
				fields.push({ number, wireType, value: bytes.subarray(position, (position += 4)) });
				break;
			case WireType.LengthDelimited: {
				const length = Number(readVarint());
				fields.push({ number, wireType, value: bytes.subarray(position, (position += length)) });
				break;
			}
			default:
				throw new Error(`Unsupported wire type ${wireType} at byte ${position}`);
		}
		if (position > bytes.length) throw new Error('Truncated message');
	}
	return fields;
}

export function varintByteLength(value: VarintValue): number {
	if (typeof value === 'number' && value >= 0 && value < 2 ** 31) {
		let length = 1;
		while (value >= 0x80) {
			value = Math.floor(value / 128);
			length++;
		}
		return length;
	}
	let big = BigInt.asUintN(64, BigInt(value));
	let length = 1;
	while (big >= 0x80n) {
		big >>= 7n;
		length++;
	}
	return length;
}

function writeVarint(target: Uint8Array, position: number, value: VarintValue): number {
	if (typeof value === 'number' && value >= 0 && value < 2 ** 31) {
		while (value >= 0x80) {
			target[position++] = (value & 0x7f) | 0x80;
			value >>>= 7;
		}
		target[position++] = value;
		return position;
	}
	let big = BigInt.asUintN(64, BigInt(value));
	while (big >= 0x80n) {
		target[position++] = Number(big & 0x7fn) | 0x80;
		big >>= 7n;
	}
	target[position++] = Number(big);
	return position;
}

export function encodeFields(fields: readonly Field[]): Uint8Array {
	let size = 0;
	for (const field of fields) {
		size += varintByteLength(field.number * 8 + field.wireType);
		if (field.wireType === WireType.Varint) size += varintByteLength(field.value);
		else if (field.wireType === WireType.LengthDelimited)
			size += varintByteLength(field.value.length) + field.value.length;
		else size += field.value.length;
	}
	const output = new Uint8Array(size);
	let position = 0;
	for (const field of fields) {
		position = writeVarint(output, position, field.number * 8 + field.wireType);
		if (field.wireType === WireType.Varint) {
			position = writeVarint(output, position, field.value);
		} else {
			if (field.wireType === WireType.LengthDelimited)
				position = writeVarint(output, position, field.value.length);
			output.set(field.value, position);
			position += field.value.length;
		}
	}
	return output;
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
	const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
	let position = 0;
	for (const part of parts) {
		output.set(part, position);
		position += part.length;
	}
	return output;
}

export const decodeString = (bytes: Uint8Array) => textDecoder.decode(bytes);
export const encodeString = (text: string) => textEncoder.encode(text);

export function decodeFloat32(bytes: Uint8Array): number {
	return new DataView(bytes.buffer, bytes.byteOffset, 4).getFloat32(0, true);
}

export function decodePackedVarints(bytes: Uint8Array): VarintValue[] {
	const values: VarintValue[] = [];
	let position = 0;
	while (position < bytes.length) {
		let shift = 0n;
		let result = 0n;
		for (;;) {
			const byte = bytes[position++];
			result |= BigInt(byte & 0x7f) << shift;
			if (byte < 0x80) break;
			shift += 7n;
		}
		values.push(result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : result);
	}
	return values;
}

export const varintToNumber = (value: VarintValue) =>
	typeof value === 'bigint' ? Number(BigInt.asIntN(64, value)) : value;
export const varintToKey = (value: VarintValue) => BigInt.asIntN(64, BigInt(value)).toString();
export const keyToVarint = (key: string): VarintValue => {
	const big = BigInt(key);
	return big >= 0n && big <= BigInt(Number.MAX_SAFE_INTEGER)
		? Number(big)
		: BigInt.asUintN(64, big);
};
