<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { config, models, settings, showCallOverlay } from '$lib/stores';
	import { onMount, tick, getContext, onDestroy } from 'svelte';

	import { blobToFile } from '$lib/utils';
	import { generateEmoji } from '$lib/apis';
	import { transcribeAudio, synthesizeOpenAISpeechStream } from '$lib/apis/audio';
	import {
		createStreamReadAloudPlayer,
		type StreamReadAloudPlayer
	} from '$lib/utils/readAloudStreamPlayer';
	import { pumpSpeechStreamToPlayer } from '$lib/utils/callSpeechPump';

	import { toast } from 'svelte-sonner';

	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import VideoInputMenu from './CallOverlay/VideoInputMenu.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		eventTarget: EventTarget;
		submitPrompt: AnyFn;
		stopResponse: AnyFn;
		/* eslint-disable @typescript-eslint/no-explicit-any */
		files: any;
		chatId: any;
		modelId: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		onClose?: AnyFn;
	}

	let {
		eventTarget,
		submitPrompt,
		stopResponse,
		// eslint-disable-next-line no-useless-assignment -- $bindable() default is reassigned once the parent's real value is observed
		files = $bindable(),
		chatId,
		modelId,
		onClose = () => {}
	}: Props = $props();

	let wakeLock = null;

	let model = $state(null);

	let loading = $state(false);
	let confirmed = false;
	let assistantSpeaking = $state(false);

	let emoji = $state(null);
	let camera = $state(false);
	let cameraStream = $state(null);

	let chatStreaming = false;
	let rmsLevel = $state(0);
	let hasStartedSpeaking = false;
	let mediaRecorder;
	let audioStream = $state(null);
	let audioChunks = [];

	let videoInputDevices = $state([]);
	let selectedVideoInputDeviceId = $state(null);

	const getVideoInputDevices = async () => {
		const devices = await navigator.mediaDevices.enumerateDevices();
		videoInputDevices = devices.filter((device) => device.kind === 'videoinput');

		if (navigator.mediaDevices.getDisplayMedia) {
			videoInputDevices = [
				...videoInputDevices,
				{
					deviceId: 'screen',
					label: 'Screen Share'
				}
			];
		}

		console.log(videoInputDevices);
		if (selectedVideoInputDeviceId === null && videoInputDevices.length > 0) {
			selectedVideoInputDeviceId = videoInputDevices[0].deviceId;
		}
	};

	const startCamera = async () => {
		await getVideoInputDevices();

		if (cameraStream === null) {
			camera = true;
			await tick();
			try {
				await startVideoStream();
			} catch (err) {
				console.error('Error accessing webcam: ', err);
			}
		}
	};

	const startVideoStream = async () => {
		const video = document.getElementById('camera-feed') as HTMLVideoElement;
		if (video) {
			if (selectedVideoInputDeviceId === 'screen') {
				cameraStream = await navigator.mediaDevices.getDisplayMedia({
					// `cursor` is a real, browser-supported screen-capture constraint
					// (Chrome/Edge) that lib.dom.d.ts's MediaTrackConstraints doesn't model.
					video: {
						cursor: 'always'
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
					} as any,
					audio: false
				});
			} else {
				cameraStream = await navigator.mediaDevices.getUserMedia({
					video: {
						deviceId: selectedVideoInputDeviceId ? { exact: selectedVideoInputDeviceId } : undefined
					}
				});
			}

			if (cameraStream) {
				await getVideoInputDevices();
				video.srcObject = cameraStream;
				await video.play();
			}
		}
	};

	const stopVideoStream = async () => {
		if (cameraStream) {
			const tracks = cameraStream.getTracks();
			tracks.forEach((track) => track.stop());
		}

		cameraStream = null;
	};

	const takeScreenshot = () => {
		const video = document.getElementById('camera-feed') as HTMLVideoElement;
		const canvas = document.getElementById('camera-canvas') as HTMLCanvasElement;

		if (!canvas) {
			return;
		}

		const context = canvas.getContext('2d');

		// Make the canvas match the video dimensions
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		// Draw the image from the video onto the canvas
		context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

		// Convert the canvas to a data base64 URL and console log it
		const dataURL = canvas.toDataURL('image/png');
		console.log(dataURL);

		return dataURL;
	};

	const stopCamera = async () => {
		await stopVideoStream();
		camera = false;
	};

	const MIN_DECIBELS = -55;

	const transcribeHandler = async (audioBlob) => {
		// Create a blob from the audio chunks

		await tick();
		const file = blobToFile(audioBlob, 'recording.wav');

		const res = await transcribeAudio(localStorage.token, file).catch((error) => {
			toast.error(error);
			return null;
		});

		if (res) {
			console.log(res.text);

			if (res.text !== '') {
				const _responses = await submitPrompt(res.text, { _raw: true });
				console.log(_responses);
			}
		}
	};

	const stopRecordingCallback = async (_continue = true) => {
		if ($showCallOverlay) {
			console.log('%c%s', 'color: red; font-size: 20px;', '🚨 stopRecordingCallback 🚨');

			// deep copy the audioChunks array
			const _audioChunks = audioChunks.slice(0);

			audioChunks = [];
			mediaRecorder = false;

			if (_continue) {
				startRecording();
			}

			if (confirmed) {
				loading = true;
				emoji = null;

				if (cameraStream) {
					const imageUrl = takeScreenshot();

					files = [
						{
							type: 'image',
							url: imageUrl
						}
					];
				}

				const audioBlob = new Blob(_audioChunks, { type: 'audio/wav' });
				await transcribeHandler(audioBlob);

				confirmed = false;
				loading = false;
			}
		} else {
			audioChunks = [];
			mediaRecorder = false;

			if (audioStream) {
				const tracks = audioStream.getTracks();
				tracks.forEach((track) => track.stop());
			}
			audioStream = null;
		}
	};

	const startRecording = async () => {
		if ($showCallOverlay) {
			if (!audioStream) {
				audioStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true
					}
				});
			}
			mediaRecorder = new MediaRecorder(audioStream);

			mediaRecorder.onstart = () => {
				console.log('Recording started');
				audioChunks = [];
				analyseAudio(audioStream);
			};

			mediaRecorder.ondataavailable = (event) => {
				if (hasStartedSpeaking) {
					audioChunks.push(event.data);
				}
			};

			mediaRecorder.onstop = (e) => {
				console.log('Recording stopped', audioStream, e);
				stopRecordingCallback();
			};

			mediaRecorder.start();
		}
	};

	const stopAudioStream = async () => {
		try {
			if (mediaRecorder) {
				mediaRecorder.stop();
			}
		} catch (error) {
			console.log('Error stopping audio stream:', error);
		}

		if (!audioStream) return;

		audioStream.getAudioTracks().forEach(function (track) {
			track.stop();
		});

		audioStream = null;
	};

	// Function to calculate the RMS level from time domain data
	const calculateRMS = (data: Uint8Array) => {
		let sumSquares = 0;
		for (let i = 0; i < data.length; i++) {
			const normalizedValue = (data[i] - 128) / 128; // Normalize the data
			sumSquares += normalizedValue * normalizedValue;
		}
		return Math.sqrt(sumSquares / data.length);
	};

	const analyseAudio = (stream) => {
		// shared per-call context (see callAudioCtx note above)
		const audioContext = ensureAudioContext();
		const audioStreamSource = audioContext.createMediaStreamSource(stream);

		const analyser = audioContext.createAnalyser();
		analyser.minDecibels = MIN_DECIBELS;
		audioStreamSource.connect(analyser);

		const bufferLength = analyser.frequencyBinCount;

		const domainData = new Uint8Array(bufferLength);
		const timeDomainData = new Uint8Array(analyser.fftSize);

		let lastSoundTime = Date.now();
		hasStartedSpeaking = false;

		console.log('🔊 Sound detection started', lastSoundTime, hasStartedSpeaking);

		const detectSound = () => {
			const processFrame = () => {
				if (!mediaRecorder || !$showCallOverlay) {
					return;
				}

				if (assistantSpeaking && !($settings?.voiceInterruption ?? false)) {
					// Mute the audio if the assistant is speaking
					analyser.maxDecibels = 0;
					analyser.minDecibels = -1;
				} else {
					analyser.minDecibels = MIN_DECIBELS;
					analyser.maxDecibels = -30;
				}

				analyser.getByteTimeDomainData(timeDomainData);
				analyser.getByteFrequencyData(domainData);

				// Calculate RMS level from time domain data
				rmsLevel = calculateRMS(timeDomainData);

				// Check if initial speech/noise has started
				const hasSound = domainData.some((value) => value > 0);
				if (hasSound) {
					// BIG RED TEXT
					console.log('%c%s', 'color: red; font-size: 20px;', '🔊 Sound detected');

					if (!hasStartedSpeaking) {
						hasStartedSpeaking = true;
						stopAllAudio();
					}

					lastSoundTime = Date.now();
				}

				// Start silence detection only after initial speech/noise has been detected
				if (hasStartedSpeaking) {
					if (Date.now() - lastSoundTime > 2000) {
						confirmed = true;

						if (mediaRecorder) {
							console.log('%c%s', 'color: red; font-size: 20px;', '🔇 Silence detected');
							mediaRecorder.stop();
							return;
						}
					}
				}

				window.requestAnimationFrame(processFrame);
			};

			window.requestAnimationFrame(processFrame);
		};

		detectSound();
	};

	let currentMessageId = null;
	let currentUtterance = null;

	const speakSpeechSynthesisHandler = (content) => {
		if ($showCallOverlay) {
			return new Promise((resolve) => {
				let voices = [];
				const getVoicesLoop = setInterval(async () => {
					voices = await speechSynthesis.getVoices();
					if (voices.length > 0) {
						clearInterval(getVoicesLoop);

						const voice =
							voices
								?.filter(
									(v) => v.voiceURI === ($settings?.audio?.tts?.voice ?? $config?.audio?.tts?.voice)
								)
								?.at(0) ?? undefined;

						currentUtterance = new SpeechSynthesisUtterance(content);
						currentUtterance.rate = $settings.audio?.tts?.playbackRate ?? 1;

						if (voice) {
							currentUtterance.voice = voice;
						}

						speechSynthesis.speak(currentUtterance);
						currentUtterance.onend = async (e) => {
							await new Promise((r) => setTimeout(r, 200));
							resolve(e);
						};
					}
				}, 100);
			});
		} else {
			return Promise.resolve();
		}
	};


	const stopAllAudio = async () => {
		assistantSpeaking = false;

		if (chatStreaming) {
			stopResponse();
		}

		if (currentUtterance) {
			speechSynthesis.cancel();
			currentUtterance = null;
		}

		// hard-stop the gapless timeline; a fresh one is built on the next turn
		streamPlayer?.stop();
		streamPlayer = null;
	};

	let audioAbortController = new AbortController();

	// One AudioContext for the whole call (VAD + playback). Browsers cap
	// concurrent contexts (~6), so the old per-turn analyseAudio() contexts
	// were a leak waiting to happen. Created on mount — inside the call-open
	// click gesture chain, which keeps the autoplay policy happy — and closed
	// on destroy.
	let callAudioCtx: AudioContext | null = null;

	// One gapless player per assistant turn: sentence chunks are scheduled
	// back to back on the WebAudio timeline, so audio starts as the first
	// bytes land and flows at synthesis speed instead of waiting for whole
	// per-sentence blobs. Barge-in = player.stop().
	let streamPlayer: StreamReadAloudPlayer | null = null;

	// In-flight sentence synthesis pumps for the current turn. Mutated via
	// add()/delete() and spread-read only inside handlers — never read by the
	// template or a $: block, so SvelteSet would add proxy overhead for no
	// benefit (same reasoning as emojiCache below).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingSentences = new Set<Promise<void>>();

	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const emojiCache = new Map();

	const ensureAudioContext = () => {
		if (!callAudioCtx) {
			callAudioCtx = new AudioContext();
		}
		if (callAudioCtx.state === 'suspended') {
			void callAudioCtx.resume();
		}
		return callAudioCtx;
	};

	// Per-model voice (Studio Model meta.audio.tts_voice) overrides the
	// user/global default for the model driving this voice call.
	const resolveVoice = () =>
		model?.info?.meta?.audio?.tts_voice ??
		($settings?.audio?.tts?.defaultVoice === $config.audio.tts.voice
			? ($settings?.audio?.tts?.voice ?? $config?.audio?.tts?.voice)
			: $config?.audio?.tts?.voice);

	const speakSentence = (content: string) => {
		// per-sentence emoji stays non-blocking decoration, never ahead of audio
		if ($settings?.showEmojiInCall ?? false) {
			void generateEmoji(localStorage.token, modelId, content, chatId).then((e) => {
				if (e && assistantSpeaking) {
					emojiCache.set(content, e);
					emoji = e;
				}
			});
		}

		if ($config.audio.tts.engine === '' || !callAudioCtx || !streamPlayer) {
			// no lane (or no context yet): the browser's speech queue serializes
			// utterances; track them so the turn only ends once spoken
			const spoken: Promise<void> = (async () => {
				await speakSpeechSynthesisHandler(content);
			})();
			pendingSentences.add(spoken);
			void spoken.finally(() => pendingSentences.delete(spoken));
			return;
		}

		const player = streamPlayer;
		const ctx = callAudioCtx;
		const rate = $settings.audio?.tts?.playbackRate ?? 1;
		const signal = audioAbortController.signal;
		const pump = (async () => {
			try {
				const res = await synthesizeOpenAISpeechStream(
					localStorage.token,
					resolveVoice(),
					content,
					undefined,
					signal
				);
				if (!res || !res.body) {
					return;
				}
				await pumpSpeechStreamToPlayer(res.body, player, ctx, rate);
			} catch (err) {
				console.error('call tts: sentence failed:', err);
			}
		})();
		pendingSentences.add(pump);
		void pump.finally(() => pendingSentences.delete(pump));
	};

	const chatStartHandler = async (e) => {
		const { id } = e.detail;

		chatStreaming = true;

		if (currentMessageId !== id) {
			currentMessageId = id;
			if (audioAbortController) {
				audioAbortController.abort();
			}
			audioAbortController = new AbortController();

			// fresh gapless timeline for this turn (barge-in may have stopped the old one)
			const ctx = ensureAudioContext();
			if (streamPlayer) {
				streamPlayer.stop();
			}
			streamPlayer = createStreamReadAloudPlayer(ctx);
			emoji = null;
			assistantSpeaking = true;
		}
	};

	const chatEventHandler = async (e) => {
		const { id, content } = e.detail;
		// "id" here is message id, "content" a sentence of the assistant reply;
		// there will be many sentences for the same "id"

		if (currentMessageId === id) {
			speakSentence(content);
		}
	};

	const chatFinishHandler = async (e) => {
		const { id } = e.detail;

		chatStreaming = false;

		if (currentMessageId !== id) {
			return;
		}
		const player = streamPlayer;
		if (!player) {
			assistantSpeaking = false;
			return;
		}
		// every sentence stream has landed on the timeline — close it and
		// wait out the tail. A barge-in replacing the player resolves this
		// via stop() instead.
		await Promise.allSettled([...pendingSentences]);
		player.markInputDone();
		await player.whenDone;
		if (streamPlayer === player) {
			assistantSpeaking = false;
		}
	};

	onMount(async () => {
		const setWakeLock = async () => {
			try {
				wakeLock = await navigator.wakeLock.request('screen');
			} catch (err) {
				// The Wake Lock request has failed - usually system related, such as battery.
				console.log(err);
			}

			if (wakeLock) {
				// Add a listener to release the wake lock when the page is unloaded
				wakeLock.addEventListener('release', () => {
					// the wake lock has been released
					console.log('Wake Lock released');
				});
			}
		};

		if ('wakeLock' in navigator) {
			await setWakeLock();

			document.addEventListener('visibilitychange', async () => {
				// Re-request the wake lock if the document becomes visible
				if (wakeLock !== null && document.visibilityState === 'visible') {
					await setWakeLock();
				}
			});
		}

		model = $models.find((m) => m.id === modelId);

		// inside the call-open gesture chain: the context must exist before the
		// first turn so sentence pumps never fall back on a missing context
		ensureAudioContext();
		startRecording();

		eventTarget.addEventListener('chat:start', chatStartHandler);
		eventTarget.addEventListener('chat', chatEventHandler);
		eventTarget.addEventListener('chat:finish', chatFinishHandler);
		// NB: this onMount callback is async, so a returned cleanup function is
		// never actually invoked on unmount -- Svelte only calls a cleanup
		// function returned *synchronously* from onMount (see onMount's JSDoc).
		// A `return async () => {...}` used to live here as dead code; the
		// equivalent cleanup is handled below in onDestroy, which fires
		// reliably since this component is mounted/destroyed each time
		// $showCallOverlay toggles (see ChatControls.svelte).
	});

	onDestroy(async () => {
		await stopAllAudio();
		await stopRecordingCallback(false);
		await stopCamera();

		await stopAudioStream();
		eventTarget.removeEventListener('chat:start', chatStartHandler);
		eventTarget.removeEventListener('chat', chatEventHandler);
		eventTarget.removeEventListener('chat:finish', chatFinishHandler);
		audioAbortController.abort();
		pendingSentences.clear();
		callAudioCtx?.close();
		callAudioCtx = null;

		await tick();

		await stopAllAudio();
	});
</script>

{#if $showCallOverlay}
	<div class="max-w-lg w-full h-full max-h-[100dvh] flex flex-col justify-between p-3 md:p-6">
		{#if camera}
			<button
				type="button"
				class="flex justify-center items-center w-full h-20 min-h-20"
				onclick={() => {
					if (assistantSpeaking) {
						stopAllAudio();
					}
				}}
			>
				{#if emoji}
					<div
						class="  transition-all rounded-full"
						style="font-size:{rmsLevel * 100 > 4
							? '4.5'
							: rmsLevel * 100 > 2
								? '4.25'
								: rmsLevel * 100 > 1
									? '3.75'
									: '3.5'}rem;width: 100%; text-align:center;"
					>
						{emoji}
					</div>
				{:else if loading || assistantSpeaking}
					<svg
						class="size-12 text-gray-900 dark:text-gray-400"
						viewBox="0 0 24 24"
						fill="currentColor"
						xmlns="http://www.w3.org/2000/svg"
						><style>
							.spinner_qM83 {
								animation: spinner_8HQG 1.05s infinite;
							}
							.spinner_oXPr {
								animation-delay: 0.1s;
							}
							.spinner_ZTLf {
								animation-delay: 0.2s;
							}
							@keyframes spinner_8HQG {
								0%,
								57.14% {
									animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
									transform: translate(0);
								}
								28.57% {
									animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
									transform: translateY(-6px);
								}
								100% {
									transform: translate(0);
								}
							}
						</style><circle class="spinner_qM83" cx="4" cy="12" r="3" /><circle
							class="spinner_qM83 spinner_oXPr"
							cx="12"
							cy="12"
							r="3"
						/><circle class="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3" /></svg
					>
				{:else}
					<div
						class=" {rmsLevel * 100 > 4
							? ' size-[4.5rem]'
							: rmsLevel * 100 > 2
								? ' size-16'
								: rmsLevel * 100 > 1
									? 'size-14'
									: 'size-12'}  transition-all rounded-full {(model?.info?.meta
							?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png'
							? ' bg-cover bg-center bg-no-repeat'
							: 'bg-black dark:bg-white'}  bg-black dark:bg-white"
						style={(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !==
						'/static/favicon.png'
							? `background-image: url('${model?.info?.meta?.profile_image_url}');`
							: ''}
					></div>
				{/if}
				<!-- navbar -->
			</button>
		{/if}

		<div class="flex justify-center items-center flex-1 h-full w-full max-h-full">
			{#if !camera}
				<button
					type="button"
					onclick={() => {
						if (assistantSpeaking) {
							stopAllAudio();
						}
					}}
				>
					{#if emoji}
						<div
							class="  transition-all rounded-full"
							style="font-size:{rmsLevel * 100 > 4
								? '13'
								: rmsLevel * 100 > 2
									? '12'
									: rmsLevel * 100 > 1
										? '11.5'
										: '11'}rem;width:100%;text-align:center;"
						>
							{emoji}
						</div>
					{:else if loading || assistantSpeaking}
						<svg
							class="size-44 text-gray-900 dark:text-gray-400"
							viewBox="0 0 24 24"
							fill="currentColor"
							xmlns="http://www.w3.org/2000/svg"
							><style>
								.spinner_qM83 {
									animation: spinner_8HQG 1.05s infinite;
								}
								.spinner_oXPr {
									animation-delay: 0.1s;
								}
								.spinner_ZTLf {
									animation-delay: 0.2s;
								}
								@keyframes spinner_8HQG {
									0%,
									57.14% {
										animation-timing-function: cubic-bezier(0.33, 0.66, 0.66, 1);
										transform: translate(0);
									}
									28.57% {
										animation-timing-function: cubic-bezier(0.33, 0, 0.66, 0.33);
										transform: translateY(-6px);
									}
									100% {
										transform: translate(0);
									}
								}
							</style><circle class="spinner_qM83" cx="4" cy="12" r="3" /><circle
								class="spinner_qM83 spinner_oXPr"
								cx="12"
								cy="12"
								r="3"
							/><circle class="spinner_qM83 spinner_ZTLf" cx="20" cy="12" r="3" /></svg
						>
					{:else}
						<div
							class=" {rmsLevel * 100 > 4
								? ' size-52'
								: rmsLevel * 100 > 2
									? 'size-48'
									: rmsLevel * 100 > 1
										? 'size-44'
										: 'size-40'}  transition-all rounded-full {(model?.info?.meta
								?.profile_image_url ?? '/static/favicon.png') !== '/static/favicon.png'
								? ' bg-cover bg-center bg-no-repeat'
								: 'bg-black dark:bg-white'} "
							style={(model?.info?.meta?.profile_image_url ?? '/static/favicon.png') !==
							'/static/favicon.png'
								? `background-image: url('${model?.info?.meta?.profile_image_url}');`
								: ''}
						></div>
					{/if}
				</button>
			{:else}
				<div class="relative flex video-container w-full max-h-full pt-2 pb-4 md:py-6 px-2 h-full">
					<!-- Live local webcam self-view (populated via video.srcObject in JS, no
					     src/captions file exists) — empty track satisfies a11y-media-has-caption. -->
					<video
						id="camera-feed"
						autoplay
						class="rounded-2xl h-full min-w-full object-cover object-center"
						playsinline
					>
						<track kind="captions" />
					</video>

					<canvas id="camera-canvas" style="display:none;"></canvas>

					<div class=" absolute top-4 md:top-8 left-4">
						<button
							type="button"
							class="p-1.5 text-white cursor-pointer backdrop-blur-xl bg-black/10 rounded-full"
							onclick={() => {
								stopCamera();
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 16 16"
								fill="currentColor"
								class="size-6"
							>
								<path
									d="M5.28 4.22a.75.75 0 0 0-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 1 0 1.06 1.06L8 9.06l2.72 2.72a.75.75 0 1 0 1.06-1.06L9.06 8l2.72-2.72a.75.75 0 0 0-1.06-1.06L8 6.94 5.28 4.22Z"
								/>
							</svg>
						</button>
					</div>
				</div>
			{/if}
		</div>

		<div class="flex justify-between items-center pb-2 w-full">
			<div>
				{#if camera}
					<VideoInputMenu
						devices={videoInputDevices}
						onChange={async (deviceId) => {
							console.log(deviceId);
							selectedVideoInputDeviceId = deviceId;
							await stopVideoStream();
							await startVideoStream();
						}}
					>
						<button class=" p-3 rounded-full bg-gray-50 dark:bg-gray-900" type="button">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 20 20"
								fill="currentColor"
								class="size-5"
							>
								<path
									fill-rule="evenodd"
									d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
									clip-rule="evenodd"
								/>
							</svg>
						</button>
					</VideoInputMenu>
				{:else}
					<Tooltip content={$i18n.t('Camera')}>
						<button
							class=" p-3 rounded-full bg-gray-50 dark:bg-gray-900"
							type="button"
							onclick={async () => {
								await navigator.mediaDevices.getUserMedia({ video: true });
								startCamera();
							}}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								stroke-width="1.5"
								stroke="currentColor"
								class="size-5"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"
								/>
							</svg>
						</button>
					</Tooltip>
				{/if}
			</div>

			<div>
				<button
					type="button"
					onclick={() => {
						if (assistantSpeaking) {
							stopAllAudio();
						}
					}}
				>
					<div class=" line-clamp-1 text-sm font-medium">
						{#if loading}
							{$i18n.t('Thinking...')}
						{:else if assistantSpeaking}
							{$i18n.t('Tap to interrupt')}
						{:else}
							{$i18n.t('Listening...')}
						{/if}
					</div>
				</button>
			</div>

			<div>
				<button
					class=" p-3 rounded-full bg-gray-50 dark:bg-gray-900"
					onclick={async () => {
						await stopAudioStream();
						await stopVideoStream();

						console.log(audioStream);
						console.log(cameraStream);

						showCallOverlay.set(false);
						onClose();
					}}
					type="button"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 20 20"
						fill="currentColor"
						class="size-5"
					>
						<path
							d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"
						/>
					</svg>
				</button>
			</div>
		</div>
	</div>
{/if}
