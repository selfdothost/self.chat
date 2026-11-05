import { describe, it, expect } from 'vitest';
import { createStreamReadAloudPlayer, createWavStreamParser } from './readAloudStreamPlayer';

// ---------------------------------------------------------------------------
// A mock AudioContext matching the player's AudioContextLike contract. jsdom
// ships no WebAudio, and the player was designed to depend on exactly four
// calls so this mock can be total rather than partial.
// ---------------------------------------------------------------------------

const makeCtx = () => {
	const starts: number[] = [];
	const sources: Array<{
		buffer: unknown;
		playbackRate: { value: number };
		onended: (() => void) | null;
		start: (when?: number) => void;
		stop: () => void;
	}> = [];
	return {
		currentTime: 0,
		sampleRate: 48000,
		createBuffer: (_ch: number, length: number, sampleRate: number) => ({
			length,
			sampleRate,
			getChannelData: () => new Float32Array(length)
		}),
		createBufferSource: () => {
			const src = {
				buffer: null as unknown,
				playbackRate: { value: 1 },
				onended: null as (() => void) | null,
				start: (when?: number) => {
					starts.push(when ?? 0);
					sources.push(src);
				},
				stop: () => undefined
			};
			return src;
		},
		starts,
		sources,
		fireEnded: () => {
			for (const s of sources) s.onended?.();
		}
	};
};

// PCM16 seconds -> bytes at the lane's 24 kHz mono rate.
const pcmBytes = (seconds: number, rate = 24000) => new Uint8Array(Math.floor(seconds * rate) * 2);

// ---------------------------------------------------------------------------
// WAV stream parser
// ---------------------------------------------------------------------------

const laneHeader = (rate = 24000) => {
	const b = new Uint8Array(44);
	const dv = new DataView(b.buffer);
	const ascii = (off: number, s: string) => {
		for (let i = 0; i < s.length; i++) b[off + i] = s.charCodeAt(i);
	};
	ascii(0, 'RIFF');
	dv.setUint32(4, 0xffffffff, true); // unknown length, like the lane's stream
	ascii(8, 'WAVE');
	ascii(12, 'fmt ');
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true); // PCM
	dv.setUint16(22, 1, true); // mono
	dv.setUint32(24, rate, true);
	dv.setUint32(28, rate * 2, true);
	dv.setUint16(32, 2, true);
	dv.setUint16(34, 16, true);
	ascii(36, 'data');
	dv.setUint32(40, 0xffffffff, true);
	return b;
};

describe('createWavStreamParser', () => {
	it('parses the lane header and passes PCM through untouched', () => {
		const p = createWavStreamParser();
		const head = p.push(laneHeader());
		expect(head.pcm.length).toBe(0);
		expect(head.sampleRate).toBe(24000);
		expect(p.isWav()).toBe(true);

		const pcm = new Uint8Array([1, 2, 3, 4]);
		const out = p.push(pcm);
		expect(Array.from(out.pcm)).toEqual([1, 2, 3, 4]);
		expect(out.sampleRate).toBe(24000);
	});

	it('survives the header splitting across chunk boundaries', () => {
		const p = createWavStreamParser();
		const header = laneHeader(16000);
		const first = p.push(header.slice(0, 20));
		expect(first.pcm.length).toBe(0);
		expect(p.isWav()).toBe(false);

		const pcm = new Uint8Array([9, 9]);
		const second = p.push(new Uint8Array([...header.slice(20), ...pcm]));
		expect(second.sampleRate).toBe(16000);
		expect(Array.from(second.pcm)).toEqual([9, 9]);
	});

	it('throws once 4KB arrives with no data chunk (not a WAV)', () => {
		const p = createWavStreamParser();
		p.push(new Uint8Array(3000).fill(0x20)); // spaces: no RIFF/WAVE/fmt
		expect(() => p.push(new Uint8Array(2000).fill(0x20))).toThrow(/not a WAV/);
	});
});

// ---------------------------------------------------------------------------
// Player timeline
// ---------------------------------------------------------------------------

describe('createStreamReadAloudPlayer', () => {
	it('schedules once the jitter lead is banked and chains buffers gaplessly', () => {
		const ctx = makeCtx();
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);

		// 0.3s alone stays parked under the 1.0s lead...
		player.appendPcm16(pcmBytes(0.3), 24000);
		expect(ctx.starts.length).toBe(0);
		expect(player.hasStarted()).toBe(false);

		// ...a second 0.8s append banks 1.1s total and releases both.
		player.appendPcm16(pcmBytes(0.8), 24000);
		expect(ctx.starts.length).toBe(2);
		expect(player.hasStarted()).toBe(true);

		// first source starts ~now+AHEAD; second starts exactly at
		// first.start + first.duration (0.3s) — gapless by construction.
		expect(ctx.starts[0]).toBeCloseTo(0.05, 5);
		expect(ctx.starts[1]).toBeCloseTo(0.05 + 0.3, 5);
	});

	it('applies playbackRate to the scheduled duration math', () => {
		const ctx = makeCtx();
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);
		player.appendPcm16(pcmBytes(1.0), 24000, 2.0); // 2x — 1.0s of samples = 0.5s wall
		player.appendPcm16(pcmBytes(1.0), 24000, 2.0);
		expect(ctx.starts.length).toBe(2);
		expect(ctx.starts[1]).toBeCloseTo(0.05 + 0.5, 5);
	});

	it('converts int16 little-endian to [-1, 1] floats', () => {
		const ctx = makeCtx();
		let seen: Float32Array | null = null;
		ctx.createBuffer = (_ch: number, length: number, _rate: number) => ({
			length,
			sampleRate: _rate,
			getChannelData: () => {
				const a = new Float32Array(length);
				seen = a;
				return a;
			}
		});
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);
		// max positive, max negative, zero
		player.appendPcm16(new Uint8Array([0xff, 0x7f, 0x00, 0x80, 0x00, 0x00]), 24000);
		expect(seen).not.toBeNull();
		expect(seen![0]).toBeCloseTo(32767 / 32768, 6);
		expect(seen![1]).toBeCloseTo(-1, 6);
		expect(seen![2]).toBe(0);
	});

	it('whenDone resolves only after input is done AND every source ended', async () => {
		const ctx = makeCtx();
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);
		player.appendPcm16(pcmBytes(1.0), 24000);
		player.appendPcm16(pcmBytes(1.0), 24000);
		player.markInputDone();

		let resolved = false;
		player.whenDone.then(() => {
			resolved = true;
		});
		await Promise.resolve();
		expect(resolved).toBe(false); // sources still active

		ctx.fireEnded(); // both onended
		await Promise.resolve();
		await Promise.resolve();
		expect(resolved).toBe(true);
	});

	it('releases parked audio when input completes early (short reads)', () => {
		const ctx = makeCtx();
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);
		player.appendPcm16(pcmBytes(0.3), 24000); // under lead, parked
		expect(ctx.starts.length).toBe(0);
		player.markInputDone(); // no more input: lead satisfied by definition
		expect(ctx.starts.length).toBe(1);
	});

	it('stop() ends the read immediately and resolves whenDone', async () => {
		const ctx = makeCtx();
		const player = createStreamReadAloudPlayer(ctx as unknown as AudioContext);
		player.appendPcm16(pcmBytes(1.0), 24000);
		let resolved = false;
		player.whenDone.then(() => {
			resolved = true;
		});
		player.stop();
		await Promise.resolve();
		await Promise.resolve();
		expect(resolved).toBe(true);
	});
});
