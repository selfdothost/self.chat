import { createWavStreamParser, type StreamReadAloudPlayer } from './readAloudStreamPlayer';

type AudioContextLike = {
	decodeAudioData: (buf: ArrayBuffer) => Promise<AudioBuffer>;
};

const concatBytes = (parts: Uint8Array[]): Uint8Array => {
	const total = parts.reduce((n, p) => n + p.length, 0);
	const out = new Uint8Array(total);
	let at = 0;
	for (const p of parts) {
		out.set(p, at);
		at += p.length;
	}
	return out;
};

/**
 * Pumps one chunked speech Response body into the gapless call player.
 *
 * WAV bodies take the header-aware PCM fast path (samples are scheduled the
 * moment a chunk lands); anything the parser rejects as non-WAV (mp3 from a
 * buffered lane, etc.) is retained and decoded whole via decodeAudioData as
 * the fallback — same contract as the read-aloud player's own design.
 *
 * Never throws: a sentence that fails mid-stream leaves whatever PCM already
 * appended and resolves — a gap in the call, not a dead call.
 */
export const pumpSpeechStreamToPlayer = async (
	body: ReadableStream<Uint8Array>,
	player: StreamReadAloudPlayer,
	ctx: AudioContextLike,
	playbackRate = 1
): Promise<void> => {
	const reader = body.getReader();
	const parser = createWavStreamParser();
	// 'probe' until the first chunks decide; retained bytes are kept only
	// while the fallback path may still be needed (<= 4KB + one chunk).
	let mode: 'probe' | 'wav' | 'encoded' = 'probe';
	let wavRate = 24000;
	const retained: Uint8Array[] = [];

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value || value.length === 0) continue;

			if (mode === 'wav') {
				player.appendPcm16(value, wavRate, playbackRate);
				continue;
			}

			retained.push(value);
			try {
				const out = parser.push(value);
				if (parser.isWav()) {
					mode = 'wav';
				wavRate = out.sampleRate;
				retained.length = 0;
					if (out.pcm.length > 0) {
						player.appendPcm16(out.pcm, out.sampleRate, playbackRate);
					}
				}
			} catch {
				// parser gave up on WAV within 4KB — encoded-audio fallback
				mode = 'encoded';
			}
		}
	} catch {
		// stream died mid-sentence; keep whatever was appended
		return;
	}

	if (mode === 'wav') return;

	// probe (tiny body, parser never decided) or encoded: decode whole
	const raw = concatBytes(retained);
	if (raw.length === 0) return;
	// fresh copy into an unambiguous ArrayBuffer — Uint8Array.buffer is
	// typed ArrayBufferLike (may be SharedArrayBuffer) and decodeAudioData
	// wants ArrayBuffer
	const ab = new ArrayBuffer(raw.byteLength);
	new Uint8Array(ab).set(raw);
	try {
		const buffer = await ctx.decodeAudioData(ab);
		player.appendBuffer(buffer, playbackRate);
	} catch {
		// undecodable body — nothing to add to the timeline
	}
};
