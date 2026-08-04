<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { toast } from 'svelte-sonner';
	import { onMount, getContext, tick } from 'svelte';

	import { getCuratorConfig, updateCuratorConfig } from '$lib/apis/curator';
	import {
		getLanguageEvalConfig,
		updateLanguageEvalConfig,
		type LanguageEvalConfig
	} from '$lib/apis/language_eval';
	import { getCodeEvalConfig, updateCodeEvalConfig, type CodeEvalConfig } from '$lib/apis/code_eval';
	import { getLlamolotlConfig, updateLlamolotlConfig } from '$lib/apis/llamolotl';
	import { getOllamaConfig, updateOllamaConfig } from '$lib/apis/ollama';
	import { getOpenAIConfig, updateOpenAIConfig, getOpenAIModels } from '$lib/apis/openai';
	import { getAnthropicConfig, updateAnthropicConfig } from '$lib/apis/anthropic';
	import { getModels as _getModels } from '$lib/apis';

	import { models, user } from '$lib/stores';

	import Switch from '$lib/components/common/Switch.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Plus from '$lib/components/icons/Plus.svelte';

	import OpenAIConnection from './Connections/OpenAIConnection.svelte';
	import AddConnectionModal from './Connections/AddConnectionModal.svelte';
	import OllamaConnection from './Connections/OllamaConnection.svelte';
	import CuratorConnection from './Connections/CuratorConnection.svelte';
	import LanguageEvalConnection from './Connections/LanguageEvalConnection.svelte';
	import CodeEvalConnection from './Connections/CodeEvalConnection.svelte';
	import LlamolotlConnection from './Connections/LlamolotlConnection.svelte';
	import AnthropicConnection from './Connections/AnthropicConnection.svelte';
	import AudioConnection from './Connections/AudioConnection.svelte';
	import AudioConnectionModal from './Connections/AudioConnectionModal.svelte';
	import {
		getAudioConnectionTypes,
		getAudioConnections,
		createAudioConnection,
		updateAudioConnection,
		deleteAudioConnection
	} from '$lib/apis/audio';
	import type {
		AudioConnection as AudioConnectionT,
		AudioConnectionType
	} from '$lib/apis/audio';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		onSave?: AnyFn;
	}

	let { onSave = () => {} }: Props = $props();

	// Mirror the (unexported) config shapes returned by getOllamaConfig /
	// getOpenAIConfig / getLlamolotlConfig / getCuratorConfig -- those API
	// modules don't export their config types or annotate the fetch return
	// type (unlike LanguageEvalConfig/CodeEvalConfig below), so the fetched
	// config is typed here to match what's actually read off it in onMount.
	type OllamaConfigShape = {
		ENABLE_OLLAMA_API: boolean;
		OLLAMA_BASE_URLS: string[];
		OLLAMA_API_CONFIGS: object;
	};
	type OpenAIConfigShape = {
		ENABLE_OPENAI_API: boolean;
		OPENAI_API_BASE_URLS: string[];
		OPENAI_API_KEYS: string[];
		OPENAI_API_CONFIGS: object;
	};
	type LlamolotlConfigShape = {
		ENABLE_LLAMOLOTL_API: boolean;
		LLAMOLOTL_BASE_URLS: string[];
		LLAMOLOTL_API_CONFIGS: object;
	};
	type AnthropicConfigShape = {
		ENABLE_ANTHROPIC_API: boolean;
		ANTHROPIC_BASE_URLS: string[];
		ANTHROPIC_API_CONFIGS: object;
	};
	type CuratorConfigShape = {
		ENABLE_CURATOR_API: boolean;
		CURATOR_BASE_URLS: string[];
		CURATOR_API_CONFIGS: object;
	};

	const getModels = async () => {
		const models = await _getModels(localStorage.token);
		return models;
	};

	// External
	let CURATOR_BASE_URLS = $state(['']);
	let CURATOR_API_CONFIGS = $state({});

	let LANGUAGE_EVAL_BASE_URLS: string[] = $state(['']);
	let CODE_EVAL_BASE_URLS: string[] = $state(['']);

	let LLAMOLOTL_BASE_URLS = $state(['']);
	let LLAMOLOTL_API_CONFIGS = $state({});

	let OLLAMA_BASE_URLS = $state(['']);
	let OLLAMA_API_CONFIGS = $state({});

	let OPENAI_API_KEYS = $state(['']);
	let OPENAI_API_BASE_URLS = $state(['']);
	let OPENAI_API_CONFIGS = $state({});

	let ANTHROPIC_BASE_URLS = $state(['']);
	let ANTHROPIC_API_CONFIGS = $state({});

	let ENABLE_OPENAI_API: null | boolean = $state(null);
	let ENABLE_ANTHROPIC_API: null | boolean = $state(null);
	let ENABLE_OLLAMA_API: null | boolean = $state(null);
	let ENABLE_LLAMOLOTL_API: null | boolean = $state(null);
	let ENABLE_CURATOR_API: null | boolean = $state(null);
	let ENABLE_LANGUAGE_EVAL_API: null | boolean = $state(null);
	let ENABLE_CODE_EVAL_API: null | boolean = $state(null);

	let pipelineUrls = $state({});
	let showAddOpenAIConnectionModal = $state(false);
	let showAddOllamaConnectionModal = $state(false);
	let showAddLlamolotlConnectionModal = $state(false);
	let showAddCuratorConnectionModal = $state(false);

	// Typed audio backends (the "Audio" section). These are the STT/TTS engine
	// connections relocated off the Audio settings tab — see
	// cavekit-audio-connections R1/R3/R5.
	let audioConnectionTypes: AudioConnectionType[] = $state([]);
	let audioConnections: AudioConnectionT[] = $state([]);
	let showAddAudioConnectionModal = $state(false);
	let showAddAnthropicConnectionModal = $state(false);

	const updateOpenAIHandler = async () => {
		if (ENABLE_OPENAI_API !== null) {
			OPENAI_API_BASE_URLS = OPENAI_API_BASE_URLS.filter(
				(url, urlIdx) => OPENAI_API_BASE_URLS.indexOf(url) === urlIdx && url !== ''
			).map((url) => url.replace(/\/$/, ''));

			// Check if API KEYS length is same than API URLS length
			if (OPENAI_API_KEYS.length !== OPENAI_API_BASE_URLS.length) {
				// if there are more keys than urls, remove the extra keys
				if (OPENAI_API_KEYS.length > OPENAI_API_BASE_URLS.length) {
					OPENAI_API_KEYS = OPENAI_API_KEYS.slice(0, OPENAI_API_BASE_URLS.length);
				}

				// if there are more urls than keys, add empty keys
				if (OPENAI_API_KEYS.length < OPENAI_API_BASE_URLS.length) {
					const diff = OPENAI_API_BASE_URLS.length - OPENAI_API_KEYS.length;
					for (let i = 0; i < diff; i++) {
						OPENAI_API_KEYS.push('');
					}
				}
			}

			const res = await updateOpenAIConfig(localStorage.token, {
				ENABLE_OPENAI_API: ENABLE_OPENAI_API,
				OPENAI_API_BASE_URLS: OPENAI_API_BASE_URLS,
				OPENAI_API_KEYS: OPENAI_API_KEYS,
				OPENAI_API_CONFIGS: OPENAI_API_CONFIGS
			}).catch((error) => {
				toast.error(error);
			});

			if (res) {
				toast.success($i18n.t('OpenAI API settings updated'));
				await models.set(await getModels());
			}
		}
	};

	const updateOllamaHandler = async () => {
		if (ENABLE_OLLAMA_API !== null) {
			// Wait for the Switch's own bind:checked/onChange flush to finish before
			// writing back into ENABLE_OLLAMA_API below -- reassigning the same
			// bindable synchronously from within the callback it fired from throws
			// Svelte 5's props_invalid_value (confirmed live, self.chat#31 phase 3
			// batch 3 follow-up: reproducible on every toggle when
			// OLLAMA_BASE_URLS is empty).
			await tick();

			// Remove duplicate URLs
			OLLAMA_BASE_URLS = OLLAMA_BASE_URLS.filter(
				(url, urlIdx) => OLLAMA_BASE_URLS.indexOf(url) === urlIdx && url !== ''
			).map((url) => url.replace(/\/$/, ''));

			console.log(OLLAMA_BASE_URLS);

			if (OLLAMA_BASE_URLS.length === 0) {
				ENABLE_OLLAMA_API = false;
				toast.info($i18n.t('Ollama API disabled'));
			}

			const res = await updateOllamaConfig(localStorage.token, {
				ENABLE_OLLAMA_API: ENABLE_OLLAMA_API,
				OLLAMA_BASE_URLS: OLLAMA_BASE_URLS,
				OLLAMA_API_CONFIGS: OLLAMA_API_CONFIGS
			}).catch((error) => {
				toast.error(error);
			});

			if (res) {
				toast.success($i18n.t('Ollama API settings updated'));
				await models.set(await getModels());
			}
		}
	};

	const addOpenAIConnectionHandler = async (connection) => {
		OPENAI_API_BASE_URLS = [...OPENAI_API_BASE_URLS, connection.url];
		OPENAI_API_KEYS = [...OPENAI_API_KEYS, connection.key];
		OPENAI_API_CONFIGS[connection.url] = connection.config;

		await updateOpenAIHandler();
	};

	const addOllamaConnectionHandler = async (connection) => {
		OLLAMA_BASE_URLS = [...OLLAMA_BASE_URLS, connection.url];
		OLLAMA_API_CONFIGS[connection.url] = connection.config;

		await updateOllamaHandler();
	};

	const updateAnthropicHandler = async () => {
		if (ENABLE_ANTHROPIC_API !== null) {
			// See updateOllamaHandler's comment: must not reassign ENABLE_ANTHROPIC_API
			// synchronously within the same flush as the Switch that invoked us.
			await tick();

			// Remove duplicate and empty URLs. Note there is no keys array to keep in
			// index-lockstep here -- the key lives in ANTHROPIC_API_CONFIGS[url].
			ANTHROPIC_BASE_URLS = ANTHROPIC_BASE_URLS.filter(
				(url, urlIdx) => ANTHROPIC_BASE_URLS.indexOf(url) === urlIdx && url !== ''
			).map((url) => url.replace(/\/$/, ''));

			if (ANTHROPIC_BASE_URLS.length === 0) {
				ENABLE_ANTHROPIC_API = false;
				toast.info($i18n.t('Anthropic API disabled'));
			}

			const res = await updateAnthropicConfig(localStorage.token, {
				ENABLE_ANTHROPIC_API: ENABLE_ANTHROPIC_API,
				ANTHROPIC_BASE_URLS: ANTHROPIC_BASE_URLS,
				ANTHROPIC_API_CONFIGS: ANTHROPIC_API_CONFIGS
			}).catch((error) => {
				toast.error(error);
			});

			if (res) {
				toast.success($i18n.t('Anthropic API settings updated'));
				await models.set(await getModels());
			}
		}
	};

	const addAnthropicConnectionHandler = async (connection) => {
		ANTHROPIC_BASE_URLS = [...ANTHROPIC_BASE_URLS, connection.url];
		// The key rides inside the config bag rather than a sibling array.
		ANTHROPIC_API_CONFIGS[connection.url] = { ...connection.config, key: connection.key };

		await updateAnthropicHandler();
	};

	const updateLlamolotlHandler = async () => {
		if (ENABLE_LLAMOLOTL_API !== null) {
			// See updateOllamaHandler's comment: must not reassign ENABLE_LLAMOLOTL_API
			// synchronously within the same flush as the Switch that invoked us.
			await tick();

			// Remove duplicate URLs
			LLAMOLOTL_BASE_URLS = LLAMOLOTL_BASE_URLS.filter(
				(url, urlIdx) => LLAMOLOTL_BASE_URLS.indexOf(url) === urlIdx && url !== ''
			).map((url) => url.replace(/\/$/, ''));

			if (LLAMOLOTL_BASE_URLS.length === 0) {
				ENABLE_LLAMOLOTL_API = false;
				toast.info($i18n.t('Llamolotl API disabled'));
			}

			const res = await updateLlamolotlConfig(localStorage.token, {
				ENABLE_LLAMOLOTL_API: ENABLE_LLAMOLOTL_API,
				LLAMOLOTL_BASE_URLS: LLAMOLOTL_BASE_URLS,
				LLAMOLOTL_API_CONFIGS: LLAMOLOTL_API_CONFIGS
			}).catch((error) => {
				toast.error(error);
			});

			if (res) {
				toast.success($i18n.t('Llamolotl API settings updated'));
				await models.set(await getModels());
			}
		}
	};

	const addLlamolotlConnectionHandler = async (connection) => {
		LLAMOLOTL_BASE_URLS = [...LLAMOLOTL_BASE_URLS, connection.url];
		LLAMOLOTL_API_CONFIGS[connection.url] = connection.config;

		await updateLlamolotlHandler();
	};

	const updateCuratorHandler = async () => {
		if (ENABLE_CURATOR_API !== null) {
			// See updateOllamaHandler's comment: must not reassign ENABLE_CURATOR_API
			// synchronously within the same flush as the Switch that invoked us.
			await tick();

			// Remove duplicate URLs
			CURATOR_BASE_URLS = CURATOR_BASE_URLS.filter(
				(url, urlIdx) => CURATOR_BASE_URLS.indexOf(url) === urlIdx && url !== ''
			).map((url) => url.replace(/\/$/, ''));

			if (CURATOR_BASE_URLS.length === 0) {
				ENABLE_CURATOR_API = false;
				toast.info($i18n.t('Curator API disabled'));
			}

			const res = await updateCuratorConfig(localStorage.token, {
				ENABLE_CURATOR_API: ENABLE_CURATOR_API,
				CURATOR_BASE_URLS: CURATOR_BASE_URLS,
				CURATOR_API_CONFIGS: CURATOR_API_CONFIGS
			}).catch((error) => {
				toast.error(error);
			});

			if (res) {
				toast.success($i18n.t('Curator API settings updated'));
			}
		}
	};

	const addCuratorConnectionHandler = async (connection) => {
		CURATOR_BASE_URLS = [...CURATOR_BASE_URLS, connection.url];
		CURATOR_API_CONFIGS[connection.url] = connection.config;

		await updateCuratorHandler();
	};

	const updateLanguageEvalHandler = async () => {
		if (ENABLE_LANGUAGE_EVAL_API !== null) {
			LANGUAGE_EVAL_BASE_URLS = LANGUAGE_EVAL_BASE_URLS.filter((url) => url !== '').map((url) =>
				url.replace(/\/$/, '')
			);
			await updateLanguageEvalConfig(localStorage.token, {
				ENABLE_LANGUAGE_EVAL_API: ENABLE_LANGUAGE_EVAL_API,
				LANGUAGE_EVAL_BASE_URLS
			}).catch(() => {});
		}
	};

	const updateCodeEvalHandler = async () => {
		if (ENABLE_CODE_EVAL_API !== null) {
			CODE_EVAL_BASE_URLS = CODE_EVAL_BASE_URLS.filter((url) => url !== '').map((url) =>
				url.replace(/\/$/, '')
			);
			await updateCodeEvalConfig(localStorage.token, {
				ENABLE_CODE_EVAL_API: ENABLE_CODE_EVAL_API,
				CODE_EVAL_BASE_URLS
			}).catch(() => {});
		}
	};

	onMount(async () => {
		if ($user.role === 'admin') {
			let ollamaConfig: Partial<OllamaConfigShape> = {};
			let openaiConfig: Partial<OpenAIConfigShape> = {};
			let anthropicConfig: Partial<AnthropicConfigShape> = {};
			let llamolotlConfig: Partial<LlamolotlConfigShape> = {};
			let curatorConfig: Partial<CuratorConfigShape> = {};
			let languageEvalConfig: Partial<LanguageEvalConfig> = {};
			let codeEvalConfig: Partial<CodeEvalConfig> = {};

			await Promise.all([
				(async () => {
					ollamaConfig = await getOllamaConfig(localStorage.token);
				})(),
				(async () => {
					openaiConfig = await getOpenAIConfig(localStorage.token);
				})(),
				(async () => {
					// Fail soft, like the eval-config fetches below. A rejection here (e.g. the
					// /anthropic ingress path not yet deployed, or the API being briefly
					// unreachable) must NOT reject the whole Promise.all — that leaves every
					// ENABLE_* null and the render gate never opens, blanking the entire tab
					// (self.ai#59: exactly what a missing ingress route caused in prod).
					anthropicConfig = await getAnthropicConfig(localStorage.token).catch(() => ({}));
				})(),
				(async () => {
					llamolotlConfig = await getLlamolotlConfig(localStorage.token);
				})(),
				(async () => {
					curatorConfig = await getCuratorConfig(localStorage.token);
				})(),
				(async () => {
					languageEvalConfig = await getLanguageEvalConfig(localStorage.token).catch(() => ({}));
				})(),
				(async () => {
					codeEvalConfig = await getCodeEvalConfig(localStorage.token).catch(() => ({}));
				})()
			]);

			ENABLE_OPENAI_API = openaiConfig.ENABLE_OPENAI_API;
			ENABLE_ANTHROPIC_API = anthropicConfig.ENABLE_ANTHROPIC_API ?? false;
			ENABLE_OLLAMA_API = ollamaConfig.ENABLE_OLLAMA_API;
			ENABLE_LLAMOLOTL_API = llamolotlConfig.ENABLE_LLAMOLOTL_API;
			ENABLE_CURATOR_API = curatorConfig.ENABLE_CURATOR_API;
			ENABLE_LANGUAGE_EVAL_API = languageEvalConfig.ENABLE_LANGUAGE_EVAL_API ?? false;
			ENABLE_CODE_EVAL_API = codeEvalConfig.ENABLE_CODE_EVAL_API ?? false;

			OPENAI_API_BASE_URLS = openaiConfig.OPENAI_API_BASE_URLS;
			OPENAI_API_KEYS = openaiConfig.OPENAI_API_KEYS;
			OPENAI_API_CONFIGS = openaiConfig.OPENAI_API_CONFIGS;

			ANTHROPIC_BASE_URLS = anthropicConfig.ANTHROPIC_BASE_URLS ?? [];
			ANTHROPIC_API_CONFIGS = anthropicConfig.ANTHROPIC_API_CONFIGS ?? {};

			OLLAMA_BASE_URLS = ollamaConfig.OLLAMA_BASE_URLS;
			OLLAMA_API_CONFIGS = ollamaConfig.OLLAMA_API_CONFIGS;

			LLAMOLOTL_BASE_URLS = llamolotlConfig.LLAMOLOTL_BASE_URLS;
			LLAMOLOTL_API_CONFIGS = llamolotlConfig.LLAMOLOTL_API_CONFIGS;

			CURATOR_BASE_URLS = curatorConfig.CURATOR_BASE_URLS;
			CURATOR_API_CONFIGS = curatorConfig.CURATOR_API_CONFIGS;

			LANGUAGE_EVAL_BASE_URLS = languageEvalConfig.LANGUAGE_EVAL_BASE_URLS ?? [''];
			CODE_EVAL_BASE_URLS = codeEvalConfig.CODE_EVAL_BASE_URLS ?? [''];

			if (ENABLE_OPENAI_API) {
				for (const url of OPENAI_API_BASE_URLS) {
					if (!OPENAI_API_CONFIGS[url]) {
						OPENAI_API_CONFIGS[url] = {};
					}
				}

				OPENAI_API_BASE_URLS.forEach(async (url, idx) => {
					OPENAI_API_CONFIGS[url] = OPENAI_API_CONFIGS[url] || {};
					if (!(OPENAI_API_CONFIGS[url]?.enable ?? true)) {
						return;
					}
					const res = await getOpenAIModels(localStorage.token, idx);
					if (res.pipelines) {
						pipelineUrls[url] = true;
					}
				});
			}

			if (ENABLE_ANTHROPIC_API) {
				for (const url of ANTHROPIC_BASE_URLS) {
					if (!ANTHROPIC_API_CONFIGS[url]) {
						ANTHROPIC_API_CONFIGS[url] = {};
					}
				}
			}

			if (ENABLE_OLLAMA_API) {
				for (const url of OLLAMA_BASE_URLS) {
					if (!OLLAMA_API_CONFIGS[url]) {
						OLLAMA_API_CONFIGS[url] = {};
					}
				}
			}

			if (ENABLE_LLAMOLOTL_API) {
				for (const url of LLAMOLOTL_BASE_URLS) {
					if (!LLAMOLOTL_API_CONFIGS[url]) {
						LLAMOLOTL_API_CONFIGS[url] = {};
					}
				}
			}

			if (ENABLE_CURATOR_API) {
				for (const url of CURATOR_BASE_URLS) {
					if (!CURATOR_API_CONFIGS[url]) {
						CURATOR_API_CONFIGS[url] = {};
					}
				}
			}

			await loadAudioConnections();
		}
	});

	const loadAudioConnections = async () => {
		// Both degrade to [] rather than throwing, so a deployment without audio
		// configured simply renders an empty section.
		[audioConnectionTypes, audioConnections] = await Promise.all([
			getAudioConnectionTypes(localStorage.token),
			getAudioConnections(localStorage.token)
		]);
	};

	const addAudioConnectionHandler = async ({
		type,
		fields
	}: {
		type: string;
		fields: Record<string, string>;
	}) => {
		try {
			await createAudioConnection(localStorage.token, type, fields);
			toast.success($i18n.t('Audio connection added'));
			await loadAudioConnections();
		} catch (e) {
			toast.error(`${e}`);
		}
	};

	const updateAudioConnectionHandler = async (
		id: string,
		{ fields }: { fields: Record<string, string> }
	) => {
		try {
			await updateAudioConnection(localStorage.token, id, fields);
			toast.success($i18n.t('Audio connection updated'));
			await loadAudioConnections();
		} catch (e) {
			toast.error(`${e}`);
		}
	};

	const deleteAudioConnectionHandler = async (id: string) => {
		try {
			await deleteAudioConnection(localStorage.token, id);
			toast.success($i18n.t('Audio connection deleted'));
			await loadAudioConnections();
		} catch (e) {
			toast.error(`${e}`);
		}
	};
</script>

<AddConnectionModal
	bind:show={showAddOpenAIConnectionModal}
	onSubmit={addOpenAIConnectionHandler}
/>

<AddConnectionModal
	type="ollama"
	bind:show={showAddOllamaConnectionModal}
	onSubmit={addOllamaConnectionHandler}
/>

<AddConnectionModal
	type="llamolotl"
	bind:show={showAddLlamolotlConnectionModal}
	onSubmit={addLlamolotlConnectionHandler}
/>

<AddConnectionModal
	type="curator"
	bind:show={showAddCuratorConnectionModal}
	onSubmit={addCuratorConnectionHandler}
/>

<AddConnectionModal
	type="anthropic"
	bind:show={showAddAnthropicConnectionModal}
	onSubmit={addAnthropicConnectionHandler}
/>

<AudioConnectionModal
	bind:show={showAddAudioConnectionModal}
	types={audioConnectionTypes}
	onSubmit={addAudioConnectionHandler}
/>

<form
	class="flex flex-col h-full justify-between text-sm"
	onsubmit={preventDefault(() => {
		updateOpenAIHandler();
		updateAnthropicHandler();
		updateOllamaHandler();
		updateLlamolotlHandler();
		updateCuratorHandler();
		updateLanguageEvalHandler();
		updateCodeEvalHandler();

		onSave();
	})}
>
	<div class=" overflow-y-scroll scrollbar-hidden h-full">
		{#if ENABLE_OPENAI_API !== null && ENABLE_ANTHROPIC_API !== null && ENABLE_OLLAMA_API !== null && ENABLE_LLAMOLOTL_API !== null && ENABLE_CURATOR_API !== null && ENABLE_LANGUAGE_EVAL_API !== null && ENABLE_CODE_EVAL_API !== null}
			<div class="my-2">
				<div class="mt-2 space-y-2 pr-1.5">
					<div class="flex justify-between items-center text-sm">
						<div class="  font-medium">{$i18n.t('OpenAI API')}</div>

						<div class="flex items-center">
							<div class="">
								<Switch
									bind:state={ENABLE_OPENAI_API}
									onChange={async () => {
										updateOpenAIHandler();
									}}
								/>
							</div>
						</div>
					</div>

					{#if ENABLE_OPENAI_API}
						<hr class=" border-gray-50 dark:border-gray-850" />

						<div class="">
							<div class="flex justify-between items-center">
								<div class="font-medium">{$i18n.t('Manage OpenAI API Connections')}</div>

								<Tooltip content={$i18n.t(`Add Connection`)}>
									<button
										class="px-1"
										onclick={() => {
											showAddOpenAIConnectionModal = true;
										}}
										type="button"
									>
										<Plus />
									</button>
								</Tooltip>
							</div>

							<div class="flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each OPENAI_API_BASE_URLS as url, idx (idx)}
									<OpenAIConnection
										pipeline={pipelineUrls[url] ? true : false}
										bind:url={OPENAI_API_BASE_URLS[idx]}
										bind:key={OPENAI_API_KEYS[idx]}
										bind:config={OPENAI_API_CONFIGS[url]}
										onSubmit={() => {
											updateOpenAIHandler();
										}}
										onDelete={() => {
											OPENAI_API_BASE_URLS = OPENAI_API_BASE_URLS.filter(
												(url, urlIdx) => idx !== urlIdx
											);
											OPENAI_API_KEYS = OPENAI_API_KEYS.filter((key, keyIdx) => idx !== keyIdx);
										}}
									/>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<hr class=" border-gray-50 dark:border-gray-850" />

			<div class="pr-1.5 my-2">
				<div class="flex justify-between items-center text-sm mb-2">
					<div class="  font-medium">{$i18n.t('Anthropic API')}</div>

					<div class="mt-1">
						<Switch
							bind:state={ENABLE_ANTHROPIC_API}
							onChange={async () => {
								updateAnthropicHandler();
							}}
						/>
					</div>
				</div>

				{#if ENABLE_ANTHROPIC_API}
					<hr class=" border-gray-50 dark:border-gray-850 my-2" />

					<div class="">
						<div class="flex justify-between items-center">
							<div class="font-medium">{$i18n.t('Manage Anthropic API Connections')}</div>

							<Tooltip content={$i18n.t(`Add Connection`)}>
								<button
									class="px-1"
									onclick={() => {
										showAddAnthropicConnectionModal = true;
									}}
									type="button"
								>
									<Plus />
								</button>
							</Tooltip>
						</div>

						<div class="flex flex-col gap-1.5 mt-1.5">
							<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
							{#each ANTHROPIC_BASE_URLS as url, idx (idx)}
								<AnthropicConnection
									bind:url={ANTHROPIC_BASE_URLS[idx]}
									bind:config={ANTHROPIC_API_CONFIGS[url]}
									onSubmit={() => {
										updateAnthropicHandler();
									}}
									onDelete={() => {
										ANTHROPIC_BASE_URLS = ANTHROPIC_BASE_URLS.filter(
											(url, urlIdx) => idx !== urlIdx
										);
									}}
								/>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<hr class=" border-gray-50 dark:border-gray-850" />

			<div class="pr-1.5 my-2">
				<div class="flex justify-between items-center text-sm mb-2">
					<div class="  font-medium">{$i18n.t('Ollama API')}</div>

					<div class="mt-1">
						<Switch
							bind:state={ENABLE_OLLAMA_API}
							onChange={async () => {
								updateOllamaHandler();
							}}
						/>
					</div>
				</div>

				{#if ENABLE_OLLAMA_API}
					<hr class=" border-gray-50 dark:border-gray-850 my-2" />

					<div class="">
						<div class="flex justify-between items-center">
							<div class="font-medium">{$i18n.t('Manage Ollama API Connections')}</div>

							<Tooltip content={$i18n.t(`Add Connection`)}>
								<button
									class="px-1"
									onclick={() => {
										showAddOllamaConnectionModal = true;
									}}
									type="button"
								>
									<Plus />
								</button>
							</Tooltip>
						</div>

						<div class="flex w-full gap-1.5">
							<div class="flex-1 flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each OLLAMA_BASE_URLS as url, idx (idx)}
									<OllamaConnection
										bind:url={OLLAMA_BASE_URLS[idx]}
										bind:config={OLLAMA_API_CONFIGS[url]}
										{idx}
										onSubmit={() => {
											updateOllamaHandler();
										}}
										onDelete={() => {
											OLLAMA_BASE_URLS = OLLAMA_BASE_URLS.filter((url, urlIdx) => idx !== urlIdx);
										}}
									/>
								{/each}
							</div>
						</div>

						<div class="mt-1 text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t('Trouble accessing Ollama?')}
						</div>
					</div>
				{/if}
			</div>

			<hr class=" border-gray-50 dark:border-gray-850" />

			<div class="pr-1.5 my-2">
				<div class="flex justify-between items-center text-sm mb-2">
					<div class="  font-medium">{$i18n.t('self.llamolotl API')}</div>

					<div class="mt-1">
						<Switch
							bind:state={ENABLE_LLAMOLOTL_API}
							onChange={async () => {
								updateLlamolotlHandler();
							}}
						/>
					</div>
				</div>

				{#if ENABLE_LLAMOLOTL_API}
					<hr class=" border-gray-50 dark:border-gray-850 my-2" />

					<div class="">
						<div class="flex justify-between items-center">
							<div class="font-medium">{$i18n.t('Manage self.llamolotl Connections')}</div>

							<Tooltip content={$i18n.t(`Add Connection`)}>
								<button
									class="px-1"
									onclick={() => {
										showAddLlamolotlConnectionModal = true;
									}}
									type="button"
								>
									<Plus />
								</button>
							</Tooltip>
						</div>

						<div class="flex w-full gap-1.5">
							<div class="flex-1 flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each LLAMOLOTL_BASE_URLS as url, idx (idx)}
									<LlamolotlConnection
										bind:url={LLAMOLOTL_BASE_URLS[idx]}
										bind:config={LLAMOLOTL_API_CONFIGS[url]}
										{idx}
										onSubmit={() => {
											updateLlamolotlHandler();
										}}
										onDelete={() => {
											LLAMOLOTL_BASE_URLS = LLAMOLOTL_BASE_URLS.filter((url, urlIdx) => idx !== urlIdx);
										}}
									/>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</div>

			<hr class=" border-gray-50 dark:border-gray-850" />

			<div class="pr-1.5 my-2">
				<div class="flex justify-between items-center text-sm mb-2">
					<div class="  font-medium">{$i18n.t('self.curator API')}</div>

					<div class="mt-1">
						<Switch
							bind:state={ENABLE_CURATOR_API}
							onChange={async () => {
								updateCuratorHandler();
							}}
						/>
					</div>
				</div>

				{#if ENABLE_CURATOR_API}
					<hr class=" border-gray-50 dark:border-gray-850 my-2" />

					<div class="">
						<div class="flex justify-between items-center">
							<div class="font-medium">{$i18n.t('Manage self.curator Connections')}</div>

							<Tooltip content={$i18n.t(`Add Connection`)}>
								<button
									class="px-1"
									onclick={() => {
										showAddCuratorConnectionModal = true;
									}}
									type="button"
								>
									<Plus />
								</button>
							</Tooltip>
						</div>

						<div class="flex w-full gap-1.5">
							<div class="flex-1 flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each CURATOR_BASE_URLS as url, idx (idx)}
									<CuratorConnection
										bind:url={CURATOR_BASE_URLS[idx]}
										bind:config={CURATOR_API_CONFIGS[url]}
										{idx}
										onSubmit={() => {
											updateCuratorHandler();
										}}
										onDelete={() => {
											CURATOR_BASE_URLS = CURATOR_BASE_URLS.filter((url, urlIdx) => idx !== urlIdx);
										}}
									/>
								{/each}
							</div>
						</div>
					</div>
				{/if}
			</div>
			<hr class=" border-gray-50 dark:border-gray-850" />

			<!--
				Audio backends (STT/TTS), relocated off the Audio settings tab onto the
				Connections surface — cavekit-audio-connections R1/R3/R5. Creation is
				type-first: pick one of the five kinds, then only that kind's fields
				appear (the field set comes from the server, never hardcoded here).
			-->
			<div class="pr-1.5 my-2">
				<div class="flex justify-between items-center text-sm mb-2">
					<div class="font-medium">{$i18n.t('Audio')}</div>

					<Tooltip content={$i18n.t(`Add Connection`)}>
						<button
							class="px-1"
							onclick={() => {
								showAddAudioConnectionModal = true;
							}}
							type="button"
						>
							<Plus />
						</button>
					</Tooltip>
				</div>

				<div class="text-xs text-gray-500 mb-1.5">
					{$i18n.t('Speech-to-text and text-to-speech backends.')}
				</div>

				<div class="flex flex-col gap-2 mt-1.5">
					{#each audioConnections as connection (connection.id)}
						<AudioConnection
							{connection}
							types={audioConnectionTypes}
							onSubmit={({ fields }) => updateAudioConnectionHandler(connection.id, { fields })}
							onDelete={() => deleteAudioConnectionHandler(connection.id)}
						/>
					{/each}

					{#if audioConnections.length === 0}
						<div class="text-xs text-gray-500">
							{$i18n.t('No audio connections configured.')}
						</div>
					{/if}
				</div>
			</div>

			{#if ENABLE_LANGUAGE_EVAL_API || LANGUAGE_EVAL_BASE_URLS.some((u) => u !== '')}
				<hr class=" border-gray-50 dark:border-gray-850" />

				<div class="pr-1.5 my-2">
					<div class="flex justify-between items-center text-sm mb-2">
						<div class="font-medium">{$i18n.t('self.language-eval API')}</div>
						<div class="mt-1">
							<Switch
								bind:state={ENABLE_LANGUAGE_EVAL_API}
								onChange={async () => {
									updateLanguageEvalHandler();
								}}
							/>
						</div>
					</div>

					{#if ENABLE_LANGUAGE_EVAL_API}
						<hr class=" border-gray-50 dark:border-gray-850 my-2" />
						<div class="">
							<div class="flex justify-between items-center">
								<div class="font-medium">{$i18n.t('Manage language-eval Connections')}</div>
								<Tooltip content={$i18n.t('Add Connection')}>
									<button
										class="px-1"
										onclick={() => {
											LANGUAGE_EVAL_BASE_URLS = [...LANGUAGE_EVAL_BASE_URLS, ''];
										}}
										type="button"
									>
										<Plus />
									</button>
								</Tooltip>
							</div>
							<div class="flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each LANGUAGE_EVAL_BASE_URLS as _url, idx (idx)}
									<LanguageEvalConnection
										bind:url={LANGUAGE_EVAL_BASE_URLS[idx]}
										{idx}
										onSubmit={() => updateLanguageEvalHandler()}
										onDelete={() => {
											LANGUAGE_EVAL_BASE_URLS = LANGUAGE_EVAL_BASE_URLS.filter((_, i) => i !== idx);
											updateLanguageEvalHandler();
										}}
									/>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if ENABLE_CODE_EVAL_API || CODE_EVAL_BASE_URLS.some((u) => u !== '')}
				<hr class=" border-gray-50 dark:border-gray-850" />

				<div class="pr-1.5 my-2">
					<div class="flex justify-between items-center text-sm mb-2">
						<div class="font-medium">{$i18n.t('self.code-eval API')}</div>
						<div class="mt-1">
							<Switch
								bind:state={ENABLE_CODE_EVAL_API}
								onChange={async () => {
									updateCodeEvalHandler();
								}}
							/>
						</div>
					</div>

					{#if ENABLE_CODE_EVAL_API}
						<hr class=" border-gray-50 dark:border-gray-850 my-2" />
						<div class="">
							<div class="flex justify-between items-center">
								<div class="font-medium">{$i18n.t('Manage code-eval Connections')}</div>
								<Tooltip content={$i18n.t('Add Connection')}>
									<button
										class="px-1"
										onclick={() => {
											CODE_EVAL_BASE_URLS = [...CODE_EVAL_BASE_URLS, ''];
										}}
										type="button"
									>
										<Plus />
									</button>
								</Tooltip>
							</div>
							<div class="flex flex-col gap-1.5 mt-1.5">
								<!-- entries are mutable/duplicable url strings edited in place; index is the stable slot identity -->
								{#each CODE_EVAL_BASE_URLS as _url, idx (idx)}
									<CodeEvalConnection
										bind:url={CODE_EVAL_BASE_URLS[idx]}
										{idx}
										onSubmit={() => updateCodeEvalHandler()}
										onDelete={() => {
											CODE_EVAL_BASE_URLS = CODE_EVAL_BASE_URLS.filter((_, i) => i !== idx);
											updateCodeEvalHandler();
										}}
									/>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}
		{:else}
			<div class="flex h-full justify-center">
				<div class="my-auto">
					<Spinner className="size-6" />
				</div>
			</div>
		{/if}
	</div>

	<div class="flex justify-end pt-3 text-sm font-medium">
		<button
			class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
			type="submit"
		>
			{$i18n.t('Save')}
		</button>
	</div>
</form>
