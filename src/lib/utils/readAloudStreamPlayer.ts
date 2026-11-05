/**
 * Gapless streaming read-aloud player (2026-10-27, round 4).
 *
 * The per-part `<audio>` chain could never get ahead of a lane that
 * synthesizes at or above realtime: every sentence played, then dead
 * silence while the next one buffered (the week of "plays the first
 * block, then nothing"). This module turns the lane's chunked PCM stream
 * into ONE continuous WebAudio timeline: chunks are scheduled back to
 * back on a moving cursor, so sentence boundaries stop existing on the
 * wire — audio starts as soon as the first bytes land and flows at
 * generation speed.
 *
 * Design notes (duct tape kept visible):
 *  - PCM16/WAV is the fast path: every 2 bytes is a sample, so chunks are
 *    converted and scheduled with no decoder. Non-WAV bodies (mp3 from
 *    buffered lanes) fall back to decodeAudioData per part.
 *  - A small jitter lead (START_LEAD) absorbs bursty chunk arrival; the
 *    lane being slower than realtime degrades to brief pauses at natural
 *    boundaries instead of per-chunk stutter.
 *  - Enqueue ORDER is the caller's contract: parts must be appended in
 *    message order. The player never reorders.
 *  - The AudioContext is created by the caller inside the click gesture
 *    (autoplay policy) and passed in; the player owns scheduling only.
 */

export type StreamReadAloudPlayer = {
	/** Append raw PCM16 little-endian mono bytes (fast path). */
	appendPcm16: (pcm: Uint8Array, sampleRate: number, playbackRate?: number) => void;
	/** Append an already-decoded buffer (decodeAudioData fallback path). */
	appendBuffer: (buffer: AudioBuffer, playbackRate?: number) => void;
	/** True once playback has actually begun (first samples scheduled). */
	hasStarted: () => boolean;
	/** No more input will arrive; whenDone resolves once the last sample played. */
	markInputDone: () => void;
	/** Resolves when every scheduled sample has played (also on stop()). */
	whenDone: Promise<void>;
	/** Hard stop: unschedule everything and end the read. */
	stop: () => void;
};

const START_LEAD = 1.0; // seconds parked before playback begins
const SCHEDULE_AHEAD = 0.05; // min gap between ctx.now and a new source start

type BufferSourceLike = {
	buffer: AudioBuffer | null;
	playbackRate: { value: number };
	// DOM shape: (ev: Event) => any — a zero-arg handler assigns fine, the
	// reverse does not (a real AudioContext must satisfy this interface).
	onended: ((ev: Event) => void) | null;
	start: (when?: number) => void;
	stop: () => void;
};

type AudioContextLike = {
	currentTime: number;
	sampleRate: number;
	createBuffer: (channels: number, length: number, sampleRate: number) => AudioBuffer;
	createBufferSource: () => BufferSourceLike;
};

export const createStreamReadAloudPlayer = (
	ctx: AudioContextLike
): StreamReadAloudPlayer => {
	let nextStart: number | null = null; // ctx-time cursor; null until first schedule
	let parkedSeconds = 0; // audio held back for the jitter lead
	let inputDone = false;
	let stopped = false;
	let activeSources = 0;
	let started = false;
	let doneResolve: (() => void) | null = null;
	const whenDone = new Promise<void>((res) => {
		doneResolve = res;
	});
	const parked: Array<{ buffer: AudioBuffer; playbackRate: number }> = [];
	const sources: Array<BufferSourceLike> = [];

	const maybeFinish = () => {
		if ((inputDone || stopped) && activeSources === 0 && doneResolve) {
			const r = doneResolve;
			doneResolve = null;
			r();
		}
	};

	const leadSatisfied = () => parkedSeconds >= START_LEAD || inputDone;

	const doSchedule = (buffer: AudioBuffer, playbackRate: number) => {
		// unconditional scheduling — the lead decision lives in scheduleBuffer,
		// so a flush can never re-enter the park branch (the round-4 bug the
		// unit tests caught: flush reset parkedSeconds to 0, scheduleBuffer
		// re-evaluated the lead, found it unsatisfied, and re-parked — the
		// timeline never started).
		if (stopped || buffer.length === 0) return;
		const rate = playbackRate || 1;
		const duration = buffer.length / buffer.sampleRate / rate;
		const startAt =
			nextStart === null
				? ctx.currentTime + SCHEDULE_AHEAD
				: Math.max(nextStart, ctx.currentTime + SCHEDULE_AHEAD);
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.playbackRate.value = playbackRate;
		src.onended = () => {
			activeSources -= 1;
			maybeFinish();
		};
		try {
			src.start(startAt);
			sources.push(src);
			activeSources += 1;
			started = true;
			nextStart = startAt + duration;
		} catch {
			/* already stopped — ignore */
		}
	};

	const scheduleBuffer = (buffer: AudioBuffer, playbackRate: number) => {
		if (stopped || buffer.length === 0) return;
		const rate = playbackRate || 1;
		const duration = buffer.length / buffer.sampleRate / rate;

		// Hold the very first samples until the jitter lead is banked, so a
		// bursty lane doesn't stutter out of the gate.
		if (nextStart === null && !leadSatisfied()) {
			parked.push({ buffer, playbackRate });
			parkedSeconds += duration;
			return;
		}

		doSchedule(buffer, playbackRate);
	};

	const flushParked = () => {
		while (parked.length && !stopped) {
			if (nextStart === null && !leadSatisfied()) return;
			const next = parked.shift();
			if (!next) return;
			if (nextStart === null) {
				// starting playback consumes the lead window wholesale
				parkedSeconds = 0;
			}
			doSchedule(next.buffer, next.playbackRate);
		}
	};

	return {
		appendPcm16: (pcm, sampleRate, playbackRate = 1) => {
			if (stopped || pcm.length < 2) return;
			const samples = pcm.length >> 1;
			const buffer = ctx.createBuffer(1, samples, sampleRate);
			const channel = buffer.getChannelData(0);
			const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
			for (let i = 0; i < samples; i++) {
				channel[i] = view.getInt16(i * 2, true) / 32768;
			}
			scheduleBuffer(buffer, playbackRate);
			flushParked();
		},
		appendBuffer: (buffer, playbackRate = 1) => {
			if (stopped) return;
			scheduleBuffer(buffer, playbackRate);
			flushParked();
		},
		hasStarted: () => started,
		markInputDone: () => {
			inputDone = true;
			flushParked();
			maybeFinish();
		},
		whenDone,
		stop: () => {
			if (stopped) return;
			stopped = true;
			for (const s of sources) {
				try {
					s.stop();
				} catch {
					/* already ended */
				}
			}
			activeSources = 0;
			maybeFinish();
		}
	};
};

/**
 * Streaming WAV parser: feed it the raw response bytes of ONE part, get
 * the PCM16 payload back. The lane's stream mode emits a canonical header
 * (RIFF/WAVE/fmt 16/data — sizes possibly 0xFFFFFFFF for unknown length)
 * followed by PCM; the parser tolerates the header splitting across chunk
 * boundaries and extra chunks before `data`. Throws after 4KB without a
 * `data` chunk — the caller should then treat the body as encoded audio
 * and use the decodeAudioData fallback.
 */
export const createWavStreamParser = (): {
	push: (chunk: Uint8Array) => { pcm: Uint8Array; sampleRate: number };
	isWav: () => boolean;
} => {
	let headerBytes: Uint8Array = new Uint8Array(0);
	let headerDone = false;
	let sampleRate: number = 24000;

	const findAscii = (buf: Uint8Array, needle: string, from: number): number => {
		for (let i = from; i + needle.length <= buf.length; i++) {
			let ok = true;
			for (let j = 0; j < needle.length; j++) {
				if (buf[i + j] !== needle.charCodeAt(j)) {
					ok = false;
					break;
				}
			}
			if (ok) return i;
		}
		return -1;
	};

	const parseHeader = (
		bytes: Uint8Array
	): { pcmStart: number; sampleRate: number } | null => {
		if (bytes.length < 44) return null; // canonical lane header, still arriving
		if (findAscii(bytes, 'RIFF', 0) !== 0) return null;
		if (findAscii(bytes, 'WAVE', 8) !== 8) return null;
		const fmtAt = findAscii(bytes, 'fmt ', 12);
		if (fmtAt < 0 || fmtAt + 8 + 16 > bytes.length) return null;
		const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		const rate = view.getUint32(fmtAt + 12, true);
		const dataAt = findAscii(bytes, 'data', fmtAt + 8);
		if (dataAt < 0 || dataAt + 8 > bytes.length) return null;
		return { pcmStart: dataAt + 8, sampleRate: rate };
	};

	return {
		push: (chunk: Uint8Array): { pcm: Uint8Array; sampleRate: number } => {
			if (headerDone) {
				return { pcm: chunk, sampleRate };
			}
			const merged =
				headerBytes.length === 0
					? chunk
					: (() => {
							const m = new Uint8Array(headerBytes.length + chunk.length);
							m.set(headerBytes);
							m.set(chunk, headerBytes.length);
							return m;
						})();
			if (merged.length > 4096) {
				throw new Error('not a WAV stream (no data chunk within 4KB)');
			}
			const parsed = parseHeader(merged);
			if (!parsed) {
				headerBytes = merged;
				return { pcm: new Uint8Array(0), sampleRate: 0 };
			}
			headerDone = true;
			sampleRate = parsed.sampleRate;
			return { pcm: merged.subarray(parsed.pcmStart), sampleRate: parsed.sampleRate };
		},
		isWav: () => headerDone
	};
};
