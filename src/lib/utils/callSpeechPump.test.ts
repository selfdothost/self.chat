import { describe, it, expect } from 'vitest';
import { pumpSpeechStreamToPlayer } from './callSpeechPump';
import type { StreamReadAloudPlayer } from './readAloudStreamPlayer';

const wavHeader = (rate = 24000) => {
	// canonical 44-byte PCM WAV header
	const b = new Uint8Array(44);
	const dv = new DataView(b.buffer);
	const ascii = (s: string, at: number) => {
		for (let i = 0; i < s.length; i++) b[at + i] = s.charCodeAt(i);
	};
	ascii('RIFF', 0);
	dv.setUint32(4, 36, true);
	ascii('WAVE', 8);
	ascii('fmt ', 12);
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true); // PCM
	dv.setUint16(22, 1, true); // mono
	dv.setUint32(24, rate, true);
	dv.setUint32(28, (rate * 2), true);
	dv.setUint16(32, 2, true);
	dv.setUint16(34, 16, true);
	ascii('data', 36);
	dv.setUint32(40, 0, true);
	return b;
};

const fakePlayer = () => {
	const pcm: Array<{ bytes: number[]; rate: number; playbackRate: number }> = [];
	const buffers: Array<{ buffer: unknown; playbackRate: number }> = [];
	return {
		pcm,
		buffers,
		player: {
			appendPcm16: (b: Uint8Array, rate: number, playbackRate = 1) =>
				pcm.push({ bytes: Array.from(b), rate, playbackRate }),
			appendBuffer: (buffer: AudioBuffer, playbackRate = 1) =>
				buffers.push({ buffer: buffer as unknown, playbackRate })
		} as unknown as StreamReadAloudPlayer
	};
};

const streamOf = (chunks: Uint8Array[]) =>
	new ReadableStream<Uint8Array>({
		start(c) {
			chunks.forEach((ch) => c.enqueue(ch));
			c.close();
		}
	});

// deliver every chunk, then error the NEXT pull — c.error() discards the
// not-yet-read queue, so pre-enqueueing and erroring would drop the chunks
const streamThatDiesAfter = (chunks: Uint8Array[]) => {
	let i = 0;
	return new ReadableStream<Uint8Array>({
		pull(c) {
			if (i < chunks.length) {
				c.enqueue(chunks[i++]);
			} else {
				c.error(new Error('lane died'));
			}
		}
	});
};

const fakeCtx = (decodeImpl?: (b: ArrayBuffer) => Promise<AudioBuffer>) => ({
	decodeAudioData: decodeImpl ?? (() => Promise.resolve({} as AudioBuffer))
});

describe('pumpSpeechStreamToPlayer', () => {
	it('streams WAV chunks onto the player in order with the parsed rate', async () => {
		const h = fakePlayer();
		const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);
		await pumpSpeechStreamToPlayer(
			streamOf([wavHeader(24000), pcm.subarray(0, 2), pcm.subarray(2)]),
			h.player,
			fakeCtx(),
			1.25
		);
		expect(h.buffers).toEqual([]);
		expect(h.pcm).toEqual([
			{ bytes: [1, 2], rate: 24000, playbackRate: 1.25 },
			{ bytes: [3, 4, 5, 6], rate: 24000, playbackRate: 1.25 }
		]);
	});

	it('handles the header split across chunks', async () => {
		const head = wavHeader(16000);
		const h = fakePlayer();
		await pumpSpeechStreamToPlayer(
			streamOf([head.subarray(0, 20), head.subarray(20), new Uint8Array([9, 9])]),
			h.player,
			fakeCtx()
		);
		expect(h.pcm).toEqual([{ bytes: [9, 9], rate: 16000, playbackRate: 1 }]);
	});

	it('falls back to decodeAudioData for a non-WAV body, passing every original byte', async () => {
		const h = fakePlayer();
		const seen: ArrayBuffer[] = [];
		const mp3 = [new Uint8Array([0xff, 0xfb, 1, 2]), new Uint8Array([3, 4])];
		await pumpSpeechStreamToPlayer(
			streamOf(mp3),
			h.player,
			{
				decodeAudioData: (b) => {
					seen.push(b);
					return Promise.resolve({ decoded: true } as unknown as AudioBuffer);
				}
			},
			1
		);
		expect(h.pcm).toEqual([]);
		expect(seen.length).toBe(1);
		expect(new Uint8Array(seen[0])).toEqual(new Uint8Array([0xff, 0xfb, 1, 2, 3, 4]));
		expect(h.buffers).toEqual([{ buffer: { decoded: true }, playbackRate: 1 }]);
	});

	it('keeps already-appended PCM and resolves when the reader errors mid-stream', async () => {
		const h = fakePlayer();
		// header + one PCM chunk land, the third read rejects mid-stream
		await pumpSpeechStreamToPlayer(
			streamThatDiesAfter([wavHeader(), new Uint8Array([7, 7])]),
			h.player,
			fakeCtx()
		);
		expect(h.pcm.length).toBe(1);
		expect(h.pcm[0].bytes).toEqual([7, 7]);
	});

	it('resolves quietly on an empty stream', async () => {
		const h = fakePlayer();
		await pumpSpeechStreamToPlayer(streamOf([]), h.player, fakeCtx());
		expect(h.pcm).toEqual([]);
		expect(h.buffers).toEqual([]);
	});

	it('swallows an undecodable fallback body', async () => {
		const h = fakePlayer();
		await pumpSpeechStreamToPlayer(
			streamOf([new Uint8Array([1, 2, 3])]),
			h.player,
			{
				decodeAudioData: () => Promise.reject(new Error('bad codec'))
			}
		);
		expect(h.buffers).toEqual([]);
	});
});
