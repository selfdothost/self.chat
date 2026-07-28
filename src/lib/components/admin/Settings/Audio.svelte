<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { createEventDispatcher, onMount, getContext } from 'svelte';
	const dispatch = createEventDispatcher();

	import { getBackendConfig } from '$lib/apis';
	import {
		getAudioConfig,
		updateAudioConfig,
		getModels as _getModels,
		getVoices as _getVoices,
		getSelectableVoices
	} from '$lib/apis/audio';
	import { config } from '$lib/stores';

	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import VoiceCurationModal from './Audio/VoiceCurationModal.svelte';

	import { TTS_RESPONSE_SPLIT } from '$lib/types';
	import { orphanVoiceValue } from '$lib/utils/voice-default';

	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';

	const i18n = getContext<Writable<i18nType>>('i18n');

	export let saveHandler: () => void;

	// Audio
	let TTS_OPENAI_API_BASE_URL = '';
	let TTS_OPENAI_API_KEY = '';
	let TTS_API_KEY = '';
	let TTS_ENGINE = '';
	let TTS_MODEL = '';
	let TTS_VOICE = '';
	let TTS_SPLIT_ON: TTS_RESPONSE_SPLIT = TTS_RESPONSE_SPLIT.PUNCTUATION;
	let TTS_AZURE_SPEECH_REGION = '';
	let TTS_AZURE_SPEECH_OUTPUT_FORMAT = '';

	let STT_OPENAI_API_BASE_URL = '';
	let STT_OPENAI_API_KEY = '';
	let STT_ENGINE = '';
	let STT_MODEL = '';
	let STT_WHISPER_MODEL = '';

	let STT_WHISPER_MODEL_LOADING = false;

	// `voices` holds either the browser's real SpeechSynthesisVoice[] (webapi
	// engine, keyed by .voiceURI) or the backend TTS engine's /voices response
	// (openai/elevenlabs/azure, keyed by .id) depending on TTS_ENGINE — the
	// shape genuinely varies at runtime based on which branch getVoices() takes.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let voices: any[] = [];
	let models: Awaited<ReturnType<typeof _getModels>>['models'] = [];

	// The admin-enabled (curated) self-hosted TTS voice set — cavekit-audio-admin-
	// surface R1's "options offered are the admin-enabled set".
	//
	// DELIBERATELY SEPARATE from `voices` above. That one is engine-dependent and
	// legacy: browser SpeechSynthesisVoice[] when TTS_ENGINE === '', the legacy
	// /audio/voices response otherwise. Do not merge, overwrite or repurpose it.
	// It still backs the Web API branch's voice select, where the curated set
	// does not apply (see the comment on that branch).
	//
	// This reads /voice-catalog/voices/selectable — the SAME endpoint the shipped
	// per-model voice picker (workspace/Models/ModelEditor.svelte) reads — so the
	// options offered here are consistent with downstream voice selection by
	// construction. It backs the default-voice selector in the openai/elevenlabs/
	// azure branches.
	let enabledVoices: Awaited<ReturnType<typeof getSelectableVoices>> = [];

	// Whether the curated set above has been fetched at least once. `[]` is a
	// legitimate result (the aggregation covers self-hosted TTS connections only,
	// so a deployment on a hosted provider curates nothing), which makes "empty"
	// indistinguishable from "not loaded yet" without this flag. The orphan
	// detection below needs the distinction: before the first fetch resolves,
	// every stored voice would look absent from the set.
	let enabledVoicesLoaded = false;

	// Whether the voice curation modal is open (cavekit-audio-admin-surface R2).
	let showVoiceCurationModal = false;

	const getModels = async () => {
		if (TTS_ENGINE === '') {
			models = [];
		} else {
			const res = await _getModels(localStorage.token).catch((e) => {
				toast.error(e);
			});

			if (res) {
				console.log(res);
				models = res.models;
			}
		}
	};

	const getVoices = async () => {
		if (TTS_ENGINE === '') {
			const getVoicesLoop = setInterval(() => {
				voices = speechSynthesis.getVoices();

				// do your loop
				if (voices.length > 0) {
					clearInterval(getVoicesLoop);
					voices.sort((a, b) => a.name.localeCompare(b.name, $i18n.resolvedLanguage));
				}
			}, 100);
		} else {
			const res = await _getVoices(localStorage.token).catch((e) => {
				toast.error(e);
			});

			if (res) {
				console.log(res);
				voices = res.voices;
				voices.sort((a, b) => a.name.localeCompare(b.name, $i18n.resolvedLanguage));
			}
		}
	};

	const getEnabledVoices = async () => {
		// Never throws and never toasts: getSelectableVoices normalizes a
		// deployment with no self-hosted TTS connection to []. An empty set is a
		// correct outcome here, not an error — it just means there is nothing
		// curated to offer.
		enabledVoices = await getSelectableVoices(localStorage.token);
		enabledVoicesLoaded = true;
	};

	// cavekit-audio-admin-surface R2: curation is reached from here without
	// leaving the admin settings context — the modal renders over this surface,
	// there is no route change and no navigation.
	//
	// `changed` is true only when a toggle actually succeeded while the modal was
	// open. Refetching only then is the point of the callback reporting it: an
	// admin who opened the list, looked, and closed it should not trigger a
	// pointless round trip. When something did change, the refetch is what stops
	// a just-disabled voice from still being offered as the instance default
	// without a page reload — and, if the disabled voice IS the current default,
	// it is what moves it into the flagged not-in-the-enabled-set option below
	// rather than silently dropping it.
	const voiceCurationCloseHandler = async (changed: boolean) => {
		if (changed) {
			await getEnabledVoices();
		}
	};

	// Option label for a curated voice: the voice's name plus whatever of
	// language/gender the catalog actually carries for it.
	//
	// `id` is the only field guaranteed present — name, language and gender are
	// all optional/nullable in the /voices/selectable payload and vary by TTS
	// source. Each is filtered out when absent or blank rather than interpolated,
	// which is what keeps a literal "null"/"undefined" out of the option text;
	// name falls back to the id so an option is never blank.
	const voiceLabel = (voice: (typeof enabledVoices)[number]) => {
		const details = [voice.language, voice.gender].filter(
			(detail): detail is string => typeof detail === 'string' && detail.trim() !== ''
		);

		const name = voice.name?.trim() || voice.id;

		return details.length > 0 ? `${name} (${details.join(', ')})` : name;
	};

	// cavekit-audio-admin-surface R1 AC5 — a stored default that is absent from
	// the offered set must be SURFACED, not silently discarded. Three real ways
	// this happens: the value was hand-entered before the picker existed; the
	// voice has since left the catalog; or the curated set is legitimately EMPTY
	// because the active engine is a hosted provider. See voice-default.ts for
	// the reasoning and its unit tests; empty string means "no orphan".
	//
	// The curated branches (openai/elevenlabs/azure) offer /voices/selectable.
	$: curatedOrphanVoice = orphanVoiceValue(
		TTS_VOICE,
		enabledVoices.map(({ id }) => id),
		enabledVoicesLoaded
	);

	// The Web API branch offers the visitor's own browser voices instead — a
	// voiceURI stored from one machine's browser routinely does not exist on
	// another's, and produced the same blank control. Treated as loaded only once
	// the list is populated, because speechSynthesis.getVoices() is polled and
	// starts empty; `voices` also holds a non-browser shape on other engines,
	// which the engine check keeps out.
	$: browserOrphanVoice = orphanVoiceValue(
		TTS_VOICE,
		voices.map((voice) => voice.voiceURI),
		TTS_ENGINE === '' && voices.length > 0
	);

	const updateConfigHandler = async () => {
		const res = await updateAudioConfig(localStorage.token, {
			tts: {
				OPENAI_API_BASE_URL: TTS_OPENAI_API_BASE_URL,
				OPENAI_API_KEY: TTS_OPENAI_API_KEY,
				API_KEY: TTS_API_KEY,
				ENGINE: TTS_ENGINE,
				MODEL: TTS_MODEL,
				VOICE: TTS_VOICE,
				SPLIT_ON: TTS_SPLIT_ON,
				AZURE_SPEECH_REGION: TTS_AZURE_SPEECH_REGION,
				AZURE_SPEECH_OUTPUT_FORMAT: TTS_AZURE_SPEECH_OUTPUT_FORMAT
			},
			stt: {
				OPENAI_API_BASE_URL: STT_OPENAI_API_BASE_URL,
				OPENAI_API_KEY: STT_OPENAI_API_KEY,
				ENGINE: STT_ENGINE,
				MODEL: STT_MODEL,
				WHISPER_MODEL: STT_WHISPER_MODEL
			}
		});

		if (res) {
			saveHandler();
			config.set(await getBackendConfig());
		}
	};

	const sttModelUpdateHandler = async () => {
		STT_WHISPER_MODEL_LOADING = true;
		await updateConfigHandler();
		STT_WHISPER_MODEL_LOADING = false;
	};

	onMount(async () => {
		const res = await getAudioConfig(localStorage.token);

		if (res) {
			console.log(res);
			TTS_OPENAI_API_BASE_URL = res.tts.OPENAI_API_BASE_URL;
			TTS_OPENAI_API_KEY = res.tts.OPENAI_API_KEY;
			TTS_API_KEY = res.tts.API_KEY;

			TTS_ENGINE = res.tts.ENGINE;
			TTS_MODEL = res.tts.MODEL;
			TTS_VOICE = res.tts.VOICE;

			TTS_SPLIT_ON = res.tts.SPLIT_ON || TTS_RESPONSE_SPLIT.PUNCTUATION;

			TTS_AZURE_SPEECH_OUTPUT_FORMAT = res.tts.AZURE_SPEECH_OUTPUT_FORMAT;
			TTS_AZURE_SPEECH_REGION = res.tts.AZURE_SPEECH_REGION;

			STT_OPENAI_API_BASE_URL = res.stt.OPENAI_API_BASE_URL;
			STT_OPENAI_API_KEY = res.stt.OPENAI_API_KEY;

			STT_ENGINE = res.stt.ENGINE;
			STT_MODEL = res.stt.MODEL;
			STT_WHISPER_MODEL = res.stt.WHISPER_MODEL;
		}

		await getVoices();
		await getModels();
		await getEnabledVoices();
	});
</script>

<form
	class="flex flex-col h-full justify-between space-y-3 text-sm"
	on:submit|preventDefault={async () => {
		await updateConfigHandler();
		dispatch('save');
	}}
>
	<div class=" space-y-3 overflow-y-scroll scrollbar-hidden h-full">
		<div class="flex flex-col gap-3">
			<div>
				<div class=" mb-1 text-sm font-medium">{$i18n.t('STT Settings')}</div>

				<div class=" py-0.5 flex w-full justify-between">
					<div class=" self-center text-xs font-medium">{$i18n.t('Speech-to-Text Engine')}</div>
					<div class="flex items-center relative">
						<select
							class="dark:bg-gray-900 cursor-pointer w-fit pr-8 rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
							bind:value={STT_ENGINE}
							placeholder="Select an engine"
						>
							<option value="">{$i18n.t('Whisper (Local)')}</option>
							<option value="openai">OpenAI</option>
							<option value="web">{$i18n.t('Web API')}</option>
						</select>
					</div>
				</div>

				{#if STT_ENGINE === 'openai'}
					<div>
						<div class="mt-1 flex gap-2 mb-1">
							<input
								class="flex-1 w-full bg-transparent outline-none"
								placeholder={$i18n.t('API Base URL')}
								bind:value={STT_OPENAI_API_BASE_URL}
								required
							/>

							<SensitiveInput placeholder={$i18n.t('API Key')} bind:value={STT_OPENAI_API_KEY} />
						</div>
					</div>

					<hr class=" dark:border-gray-850 my-2" />

					<div>
						<div class=" mb-1.5 text-sm font-medium">{$i18n.t('STT Model')}</div>
						<div class="flex w-full">
							<div class="flex-1">
								<input
									list="model-list"
									class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
									bind:value={STT_MODEL}
									placeholder="Select a model"
								/>

								<datalist id="model-list">
									<option value="whisper-1" />
								</datalist>
							</div>
						</div>
					</div>
				{:else if STT_ENGINE === ''}
					<div>
						<div class=" mb-1.5 text-sm font-medium">{$i18n.t('STT Model')}</div>

						<div class="flex w-full">
							<div class="flex-1 mr-2">
								<input
									class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
									placeholder={$i18n.t('Set whisper model')}
									bind:value={STT_WHISPER_MODEL}
								/>
							</div>

							<button
								class="px-2.5 bg-gray-50 hover:bg-gray-200 text-gray-800 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-gray-100 rounded-lg transition"
								on:click={() => {
									sttModelUpdateHandler();
								}}
								disabled={STT_WHISPER_MODEL_LOADING}
							>
								{#if STT_WHISPER_MODEL_LOADING}
									<div class="self-center">
										<svg
											class=" w-4 h-4"
											viewBox="0 0 24 24"
											fill="currentColor"
											xmlns="http://www.w3.org/2000/svg"
										>
											<style>
												.spinner_ajPY {
													transform-origin: center;
													animation: spinner_AtaB 0.75s infinite linear;
												}

												@keyframes spinner_AtaB {
													100% {
														transform: rotate(360deg);
													}
												}
											</style>
											<path
												d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
												opacity=".25"
											/>
											<path
												d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
												class="spinner_ajPY"
											/>
										</svg>
									</div>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										viewBox="0 0 16 16"
										fill="currentColor"
										class="w-4 h-4"
									>
										<path
											d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"
										/>
										<path
											d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"
										/>
									</svg>
								{/if}
							</button>
						</div>

						<div class="mt-2 mb-1 text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t(`Self.AI UI uses faster-whisper internally.`)}

							<a
								class=" hover:underline dark:text-gray-200 text-gray-800"
								href="https://github.com/SYSTRAN/faster-whisper"
								target="_blank"
							>
								{$i18n.t(
									`Click here to learn more about faster-whisper and see the available models.`
								)}
							</a>
						</div>
					</div>
				{/if}
			</div>

			<hr class=" dark:border-gray-800" />

			<div>
				<div class=" mb-1 text-sm font-medium">{$i18n.t('TTS Settings')}</div>

				<div class=" py-0.5 flex w-full justify-between">
					<div class=" self-center text-xs font-medium">{$i18n.t('Text-to-Speech Engine')}</div>
					<div class="flex items-center relative">
						<select
							class=" dark:bg-gray-900 w-fit pr-8 cursor-pointer rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
							bind:value={TTS_ENGINE}
							placeholder="Select a mode"
							on:change={async (e) => {
								await updateConfigHandler();
								await getVoices();
								await getModels();

								if ((e.target as HTMLSelectElement)?.value === 'openai') {
									TTS_VOICE = 'alloy';
									TTS_MODEL = 'tts-1';
								} else {
									TTS_VOICE = '';
									TTS_MODEL = '';
								}
							}}
						>
							<option value="">{$i18n.t('Web API')}</option>
							<option value="transformers">{$i18n.t('Transformers')} ({$i18n.t('Local')})</option>
							<option value="openai">{$i18n.t('OpenAI')}</option>
							<option value="elevenlabs">{$i18n.t('ElevenLabs')}</option>
							<option value="azure">{$i18n.t('Azure AI Speech')}</option>
						</select>
					</div>
				</div>

				{#if TTS_ENGINE === 'openai'}
					<div>
						<div class="mt-1 flex gap-2 mb-1">
							<input
								class="flex-1 w-full bg-transparent outline-none"
								placeholder={$i18n.t('API Base URL')}
								bind:value={TTS_OPENAI_API_BASE_URL}
								required
							/>

							<SensitiveInput placeholder={$i18n.t('API Key')} bind:value={TTS_OPENAI_API_KEY} />
						</div>
					</div>
				{:else if TTS_ENGINE === 'elevenlabs'}
					<div>
						<div class="mt-1 flex gap-2 mb-1">
							<input
								class="flex-1 w-full rounded-lg py-2 pl-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
								placeholder={$i18n.t('API Key')}
								bind:value={TTS_API_KEY}
								required
							/>
						</div>
					</div>
				{:else if TTS_ENGINE === 'azure'}
					<div>
						<div class="mt-1 flex gap-2 mb-1">
							<input
								class="flex-1 w-full rounded-lg py-2 pl-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
								placeholder={$i18n.t('API Key')}
								bind:value={TTS_API_KEY}
								required
							/>
							<input
								class="flex-1 w-full rounded-lg py-2 pl-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
								placeholder={$i18n.t('Azure Region')}
								bind:value={TTS_AZURE_SPEECH_REGION}
								required
							/>
						</div>
					</div>
				{/if}

				<hr class=" dark:border-gray-850 my-2" />

				{#if TTS_ENGINE === ''}
					<!--
						Web API engine: DELIBERATELY still driven by `voices` (the browser's
						speechSynthesis list), not by the curated `enabledVoices` set the
						backend-catalog branches below use.

						Speech here is synthesized by the client's own browser, so the voices
						on offer are whatever that browser/OS installs — they are not a
						backend catalog, they differ per visitor, and none of them exist as
						ids the voice catalog could enable or disable. The curated set simply
						does not apply to this engine. This was already a real select element,
						not free text, so R1's "selection, not a free-text field" already holds.
					-->
					<div>
						<div class=" mb-1.5 text-sm font-medium">{$i18n.t('TTS Voice')}</div>
						<div class="flex w-full">
							<div class="flex-1">
								<select
									class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
									bind:value={TTS_VOICE}
								>
									<option value="" selected={TTS_VOICE !== ''}>{$i18n.t('Default')}</option>
									{#if browserOrphanVoice !== ''}
										<!-- R1 AC5: stored value this browser has no voice for — shown and
										     selected rather than left as a blank control. -->
										<option value={browserOrphanVoice} class="bg-gray-100 dark:bg-gray-700">
											{$i18n.t('{{voice}} (current value — not in the enabled set)', {
												voice: browserOrphanVoice
											})}
										</option>
									{/if}
									{#each voices as voice (voice.voiceURI)}
										<option
											value={voice.voiceURI}
											class="bg-gray-100 dark:bg-gray-700"
											selected={TTS_VOICE === voice.voiceURI}
											>{voice.name.replace('+', ', ')}</option
										>
									{/each}
								</select>
							</div>
						</div>
					</div>
				{:else if TTS_ENGINE === 'transformers'}
					<div>
						<div class=" mb-1.5 text-sm font-medium">{$i18n.t('TTS Model')}</div>
						<div class="flex w-full">
							<div class="flex-1">
								<input
									list="model-list"
									class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
									bind:value={TTS_MODEL}
									placeholder="CMU ARCTIC speaker embedding name"
								/>

								<datalist id="model-list">
									<option value="tts-1" />
								</datalist>
							</div>
						</div>
						<div class="mt-2 mb-1 text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t(`Self.AI UI uses SpeechT5 and CMU Arctic speaker embeddings.`)}

							To learn more about SpeechT5,

							<a
								class=" hover:underline dark:text-gray-200 text-gray-800"
								href="https://github.com/microsoft/SpeechT5"
								target="_blank"
							>
								{$i18n.t(`click here`, {
									name: 'SpeechT5'
								})}.
							</a>
							To see the available CMU Arctic speaker embeddings,
							<a
								class=" hover:underline dark:text-gray-200 text-gray-800"
								href="https://huggingface.co/datasets/Matthijs/cmu-arctic-xvectors"
								target="_blank"
							>
								{$i18n.t(`click here`)}.
							</a>
						</div>
					</div>
				{:else if TTS_ENGINE === 'openai'}
					<div class=" flex gap-2">
						<div class="w-full">
							<div class="flex justify-between items-center mb-1.5">
								<div class=" text-sm font-medium">{$i18n.t('TTS Voice')}</div>

								<!--
									cavekit-audio-admin-surface R2: the curation entry point sits next
									to the control whose options it curates, and opens the curation
									surface IN PLACE — a modal over the admin settings context. No
									route change, no navigation away, no goto.
								-->
								<Tooltip
									content={$i18n.t('Voices left enabled here are the ones users can choose from.')}
								>
									<button
										class=" text-xs px-2 py-0.5 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
										type="button"
										on:click={() => {
											showVoiceCurationModal = true;
										}}
									>
										{$i18n.t('Manage Voices')}
									</button>
								</Tooltip>
							</div>
							<div class="flex w-full">
								<div class="flex-1">
									<!--
										Selection over the admin-enabled (curated) voice set, NOT free
										text: `enabledVoices` comes from /voices/selectable, the same
										endpoint the per-model voice picker reads, so what an admin can
										set as the instance default is exactly what the backend reports
										and curation allows. `bind:value` preselects the stored
										TTS_VOICE on load.
									-->
									<select
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										aria-label={$i18n.t('TTS Voice')}
										bind:value={TTS_VOICE}
									>
										<option value="" class="bg-gray-100 dark:bg-gray-700"
											>{$i18n.t('Default')}</option
										>
										{#if curatedOrphanVoice !== ''}
											<!--
												R1 AC5: the stored default is not in the curated set — a
												hand-entered value, a voice that left the catalog, or a
												hosted-provider deployment whose curated set is legitimately
												empty. Rendered as a selected, flagged option so it is
												surfaced rather than dropped to a blank control, and so an
												untouched save round trips the original string unchanged.
											-->
											<option value={curatedOrphanVoice} class="bg-gray-100 dark:bg-gray-700">
												{$i18n.t('{{voice}} (current value — not in the enabled set)', {
													voice: curatedOrphanVoice
												})}
											</option>
										{/if}
										{#each enabledVoices as voice (voice.id)}
											<option value={voice.id} class="bg-gray-100 dark:bg-gray-700"
												>{voiceLabel(voice)}</option
											>
										{/each}
									</select>
								</div>
							</div>
						</div>
						<div class="w-full">
							<div class=" mb-1.5 text-sm font-medium">{$i18n.t('TTS Model')}</div>
							<div class="flex w-full">
								<div class="flex-1">
									<input
										list="tts-model-list"
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										bind:value={TTS_MODEL}
										placeholder="Select a model"
									/>

									<datalist id="tts-model-list">
										{#each models as model (model.id)}
											<option value={model.id} class="bg-gray-50 dark:bg-gray-700" />
										{/each}
									</datalist>
								</div>
							</div>
						</div>
					</div>
				{:else if TTS_ENGINE === 'elevenlabs'}
					<div class=" flex gap-2">
						<div class="w-full">
							<div class="flex justify-between items-center mb-1.5">
								<div class=" text-sm font-medium">{$i18n.t('TTS Voice')}</div>

								<!--
									cavekit-audio-admin-surface R2: the curation entry point sits next
									to the control whose options it curates, and opens the curation
									surface IN PLACE — a modal over the admin settings context. No
									route change, no navigation away, no goto.
								-->
								<Tooltip
									content={$i18n.t('Voices left enabled here are the ones users can choose from.')}
								>
									<button
										class=" text-xs px-2 py-0.5 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
										type="button"
										on:click={() => {
											showVoiceCurationModal = true;
										}}
									>
										{$i18n.t('Manage Voices')}
									</button>
								</Tooltip>
							</div>
							<div class="flex w-full">
								<div class="flex-1">
									<!--
										Selection over the admin-enabled (curated) voice set, NOT free
										text: `enabledVoices` comes from /voices/selectable, the same
										endpoint the per-model voice picker reads, so what an admin can
										set as the instance default is exactly what the backend reports
										and curation allows. `bind:value` preselects the stored
										TTS_VOICE on load.
									-->
									<select
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										aria-label={$i18n.t('TTS Voice')}
										bind:value={TTS_VOICE}
									>
										<option value="" class="bg-gray-100 dark:bg-gray-700"
											>{$i18n.t('Default')}</option
										>
										{#if curatedOrphanVoice !== ''}
											<!--
												R1 AC5: the stored default is not in the curated set — a
												hand-entered value, a voice that left the catalog, or a
												hosted-provider deployment whose curated set is legitimately
												empty. Rendered as a selected, flagged option so it is
												surfaced rather than dropped to a blank control, and so an
												untouched save round trips the original string unchanged.
											-->
											<option value={curatedOrphanVoice} class="bg-gray-100 dark:bg-gray-700">
												{$i18n.t('{{voice}} (current value — not in the enabled set)', {
													voice: curatedOrphanVoice
												})}
											</option>
										{/if}
										{#each enabledVoices as voice (voice.id)}
											<option value={voice.id} class="bg-gray-100 dark:bg-gray-700"
												>{voiceLabel(voice)}</option
											>
										{/each}
									</select>
								</div>
							</div>
						</div>
						<div class="w-full">
							<div class=" mb-1.5 text-sm font-medium">{$i18n.t('TTS Model')}</div>
							<div class="flex w-full">
								<div class="flex-1">
									<input
										list="tts-model-list"
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										bind:value={TTS_MODEL}
										placeholder="Select a model"
									/>

									<datalist id="tts-model-list">
										{#each models as model (model.id)}
											<option value={model.id} class="bg-gray-50 dark:bg-gray-700" />
										{/each}
									</datalist>
								</div>
							</div>
						</div>
					</div>
				{:else if TTS_ENGINE === 'azure'}
					<div class=" flex gap-2">
						<div class="w-full">
							<div class="flex justify-between items-center mb-1.5">
								<div class=" text-sm font-medium">{$i18n.t('TTS Voice')}</div>

								<!--
									cavekit-audio-admin-surface R2: the curation entry point sits next
									to the control whose options it curates, and opens the curation
									surface IN PLACE — a modal over the admin settings context. No
									route change, no navigation away, no goto.
								-->
								<Tooltip
									content={$i18n.t('Voices left enabled here are the ones users can choose from.')}
								>
									<button
										class=" text-xs px-2 py-0.5 rounded-lg text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 transition"
										type="button"
										on:click={() => {
											showVoiceCurationModal = true;
										}}
									>
										{$i18n.t('Manage Voices')}
									</button>
								</Tooltip>
							</div>
							<div class="flex w-full">
								<div class="flex-1">
									<!--
										Selection over the admin-enabled (curated) voice set, NOT free
										text: `enabledVoices` comes from /voices/selectable, the same
										endpoint the per-model voice picker reads, so what an admin can
										set as the instance default is exactly what the backend reports
										and curation allows. `bind:value` preselects the stored
										TTS_VOICE on load.
									-->
									<select
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										aria-label={$i18n.t('TTS Voice')}
										bind:value={TTS_VOICE}
									>
										<option value="" class="bg-gray-100 dark:bg-gray-700"
											>{$i18n.t('Default')}</option
										>
										{#if curatedOrphanVoice !== ''}
											<!--
												R1 AC5: the stored default is not in the curated set — a
												hand-entered value, a voice that left the catalog, or a
												hosted-provider deployment whose curated set is legitimately
												empty. Rendered as a selected, flagged option so it is
												surfaced rather than dropped to a blank control, and so an
												untouched save round trips the original string unchanged.
											-->
											<option value={curatedOrphanVoice} class="bg-gray-100 dark:bg-gray-700">
												{$i18n.t('{{voice}} (current value — not in the enabled set)', {
													voice: curatedOrphanVoice
												})}
											</option>
										{/if}
										{#each enabledVoices as voice (voice.id)}
											<option value={voice.id} class="bg-gray-100 dark:bg-gray-700"
												>{voiceLabel(voice)}</option
											>
										{/each}
									</select>
								</div>
							</div>
						</div>
						<div class="w-full">
							<div class=" mb-1.5 text-sm font-medium">
								{$i18n.t('Output format')}
								<a
									href="https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech?tabs=streaming#audio-outputs"
									target="_blank"
								>
									<small>{$i18n.t('Available list')}</small>
								</a>
							</div>
							<div class="flex w-full">
								<div class="flex-1">
									<input
										list="tts-model-list"
										class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-none"
										bind:value={TTS_AZURE_SPEECH_OUTPUT_FORMAT}
										placeholder="Select a output format"
									/>
								</div>
							</div>
						</div>
					</div>
				{/if}

				<hr class="dark:border-gray-850 my-2" />

				<div class="pt-0.5 flex w-full justify-between">
					<div class="self-center text-xs font-medium">{$i18n.t('Response splitting')}</div>
					<div class="flex items-center relative">
						<select
							class="dark:bg-gray-900 w-fit pr-8 cursor-pointer rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
							aria-label="Select how to split message text for TTS requests"
							bind:value={TTS_SPLIT_ON}
						>
							{#each Object.values(TTS_RESPONSE_SPLIT) as split (split)}
								<option value={split}
									>{$i18n.t(split.charAt(0).toUpperCase() + split.slice(1))}</option
								>
							{/each}
						</select>
					</div>
				</div>
				<div class="mt-2 mb-1 text-xs text-gray-400 dark:text-gray-500">
					{$i18n.t(
						"Control how message text is split for TTS requests. 'Punctuation' splits into sentences, 'paragraphs' splits into paragraphs, and 'none' keeps the message as a single string."
					)}
				</div>
			</div>
		</div>
	</div>
	<div class="flex justify-end text-sm font-medium">
		<button
			class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
			type="submit"
		>
			{$i18n.t('Save')}
		</button>
	</div>
</form>

<!--
	Mounted as a sibling of the settings form, not inside it: the curation modal
	contains its own interactive controls, and nesting them in this form would put
	them in its submit scope. Modal.svelte reparents itself to document.body when
	shown, so this renders over the admin settings context either way — which is
	R2's requirement (reachable without leaving admin settings).
-->
<VoiceCurationModal bind:show={showVoiceCurationModal} onClose={voiceCurationCloseHandler} />
