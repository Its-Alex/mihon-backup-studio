async function pipe(
	bytes: Uint8Array,
	stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
	const response = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
	return new Uint8Array(await response.arrayBuffer());
}

const isGzip = (bytes: Uint8Array) => bytes[0] === 0x1f && bytes[1] === 0x8b;

export async function readBackupBytes(fileBytes: Uint8Array): Promise<Uint8Array> {
	return isGzip(fileBytes) ? pipe(fileBytes, new DecompressionStream('gzip')) : fileBytes;
}

export function gzip(bytes: Uint8Array): Promise<Uint8Array> {
	return pipe(bytes, new CompressionStream('gzip'));
}
