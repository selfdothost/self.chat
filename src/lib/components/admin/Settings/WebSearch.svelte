<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import { toast } from 'svelte-sonner';

	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import {
		getRAGConfig,
		updateRAGConfig,
		testWebSearchConnection,
		type WebSearchTestResult
	} from '$lib/apis/retrieval';
	import Switch from '$lib/components/common/Switch.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	import { onMount, getContext } from 'svelte';
	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		saveHandler: AnyFn;
	}

	let { saveHandler }: Props = $props();

	let webConfig = $state(null);
	let webSearchEngines = [
		'searxng',
		'google_pse',
		'brave',
		'kagi',
		'mojeek',
		'serpstack',
		'serper',
		'serply',
		'searchapi',
		'duckduckgo',
		'tavily',
		'jina',
		'bing'
	];

	let youtubeLanguage = $state('en');
	let youtubeTranslation = null;
	let youtubeProxyUrl = $state('');

	let testing = $state(false);
	let testResult = $state<WebSearchTestResult | null>(null);

	const testHandler = async () => {
		testing = true;
		testResult = null;
		try {
			testResult = await testWebSearchConnection(localStorage.token);
		} catch (err) {
			toast.error(`${err}`);
		} finally {
			testing = false;
		}
	};

	const submitHandler = async () => {
		await updateRAGConfig(localStorage.token, {
			web: webConfig,
			youtube: {
				language: youtubeLanguage.split(',').map((lang) => lang.trim()),
				translation: youtubeTranslation,
				proxy_url: youtubeProxyUrl
			}
		});
	};

	onMount(async () => {
		const res = await getRAGConfig(localStorage.token);

		if (res) {
			webConfig = res.web;

			youtubeLanguage = res.youtube.language.join(',');
			youtubeTranslation = res.youtube.translation;
			youtubeProxyUrl = res.youtube.proxy_url;
		}
	});
</script>

<form
	class="flex flex-col h-full justify-between space-y-3 text-sm"
	onsubmit={preventDefault(async () => {
		await submitHandler();
		saveHandler();
	})}
>
	<div class=" space-y-3 overflow-y-scroll scrollbar-hidden h-full">
		{#if webConfig}
			<div>
				<div class=" mb-1 text-sm font-medium">
					{$i18n.t('Web Search')}
				</div>

				<div>
					<div class=" py-0.5 flex w-full justify-between">
						<div class=" self-center text-xs font-medium">
							{$i18n.t('Enable Web Search')}
						</div>

						<Switch bind:state={webConfig.search.enabled} />
					</div>

					<div class=" py-0.5 flex w-full justify-between">
						<div class=" self-center text-xs font-medium">
							{$i18n.t('Enable Deep Research')}
						</div>

						<Switch bind:state={webConfig.search.deep_research_enabled} />
					</div>

					<div class=" mt-1 mb-2 text-xs text-gray-400 dark:text-gray-500">
						{$i18n.t(
							'Lets models read several pages and follow links between them for a single question. Slower and heavier than Web Search — enable deliberately.'
						)}
					</div>

					{#if webConfig.search.deep_research_enabled}
						<div class=" py-0.5 flex w-full justify-between">
							<div class=" self-center text-xs font-medium">
								{$i18n.t('Deep Research Page Limit')}
							</div>

							<div class="flex items-center relative">
								<input
									class="dark:bg-gray-900 w-16 rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
									type="number"
									min="1"
									max="50"
									placeholder={$i18n.t('e.g. 10')}
									bind:value={webConfig.search.deep_research_max_pages}
								/>
							</div>
						</div>

						<div class=" mb-2 text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t(
								'Most pages one research run may read before it stops. Higher is more thorough but slower and heavier on the browser service. Clamped to 1–50.'
							)}
						</div>
					{/if}

					<div class=" py-0.5 flex w-full justify-between">
						<div class=" self-center text-xs font-medium">
							{$i18n.t('Enable Web Crawl')}
						</div>

						<Switch bind:state={webConfig.search.web_crawl_enabled} />
					</div>

					<div class=" mt-1 mb-2 text-xs text-gray-400 dark:text-gray-500">
						{$i18n.t(
							'Lets models crawl a site into a knowledge base the user picks. Writes pages into that knowledge base — enable deliberately.'
						)}
					</div>

					{#if webConfig.search.web_crawl_enabled}
						<div class=" py-0.5 flex w-full justify-between">
							<div class=" self-center text-xs font-medium">
								{$i18n.t('Web Crawl Page Limit')}
							</div>
							<input
								class="dark:bg-gray-900 w-16 rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
								type="number"
								min="1"
								max="500"
								placeholder={$i18n.t('e.g. 25')}
								bind:value={webConfig.search.web_crawl_max_pages}
							/>
						</div>

						<div class=" py-0.5 flex w-full justify-between">
							<div class=" self-center text-xs font-medium">
								{$i18n.t('Web Crawl Depth')}
							</div>
							<input
								class="dark:bg-gray-900 w-16 rounded px-2 p-1 text-xs bg-transparent outline-none text-right"
								type="number"
								min="1"
								max="10"
								placeholder={$i18n.t('e.g. 2')}
								bind:value={webConfig.search.web_crawl_max_depth}
							/>
						</div>

						<div class=" mb-2 text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t(
								'Most pages one crawl may save, and how deep it follows links. The server clamps these to 1–500 and 1–10.'
							)}
						</div>
					{/if}
				</div>

				<div class=" py-0.5 flex w-full justify-between">
					<div class=" self-center text-xs font-medium">{$i18n.t('Web Search Engine')}</div>
					<div class="flex items-center relative">
						<select
							class="dark:bg-gray-900 w-fit pr-8 rounded px-2 p-1 text-xs bg-transparent outline-hidden text-right"
							bind:value={webConfig.search.engine}
							placeholder={$i18n.t('Select a engine')}
							required
						>
							<option disabled selected value="">{$i18n.t('Select a engine')}</option>
							{#each webSearchEngines as engine (engine)}
								<option value={engine}>{engine}</option>
							{/each}
						</select>
					</div>
				</div>

				{#if webConfig.search.engine !== ''}
					<div class="mt-1.5">
						{#if webConfig.search.engine === 'searxng'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Searxng Query URL')}
								</div>

								<div class="flex w-full">
									<div class="flex-1">
										<input
											class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
											type="text"
											placeholder={$i18n.t('Enter Searxng Query URL')}
											bind:value={webConfig.search.searxng_query_url}
											autocomplete="off"
										/>
									</div>
								</div>
							</div>
						{:else if webConfig.search.engine === 'google_pse'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Google PSE API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Google PSE API Key')}
									bind:value={webConfig.search.google_pse_api_key}
								/>
							</div>
							<div class="mt-1.5">
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Google PSE Engine Id')}
								</div>

								<div class="flex w-full">
									<div class="flex-1">
										<input
											class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
											type="text"
											placeholder={$i18n.t('Enter Google PSE Engine Id')}
											bind:value={webConfig.search.google_pse_engine_id}
											autocomplete="off"
										/>
									</div>
								</div>
							</div>
						{:else if webConfig.search.engine === 'brave'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Brave Search API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Brave Search API Key')}
									bind:value={webConfig.search.brave_search_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'kagi'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Kagi Search API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Kagi Search API Key')}
									bind:value={webConfig.search.kagi_search_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'mojeek'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Mojeek Search API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Mojeek Search API Key')}
									bind:value={webConfig.search.mojeek_search_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'serpstack'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Serpstack API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Serpstack API Key')}
									bind:value={webConfig.search.serpstack_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'serper'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Serper API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Serper API Key')}
									bind:value={webConfig.search.serper_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'serply'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Serply API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Serply API Key')}
									bind:value={webConfig.search.serply_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'searchapi'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('SearchApi API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter SearchApi API Key')}
									bind:value={webConfig.search.searchapi_api_key}
								/>
							</div>
							<div class="mt-1.5">
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('SearchApi Engine')}
								</div>

								<div class="flex w-full">
									<div class="flex-1">
										<input
											class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
											type="text"
											placeholder={$i18n.t('Enter SearchApi Engine')}
											bind:value={webConfig.search.searchapi_engine}
											autocomplete="off"
										/>
									</div>
								</div>
							</div>
						{:else if webConfig.search.engine === 'tavily'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Tavily API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Tavily API Key')}
									bind:value={webConfig.search.tavily_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'jina'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Jina API Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Jina API Key')}
									bind:value={webConfig.search.jina_api_key}
								/>
							</div>
						{:else if webConfig.search.engine === 'bing'}
							<div>
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Bing Search V7 Endpoint')}
								</div>

								<div class="flex w-full">
									<div class="flex-1">
										<input
											class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
											type="text"
											placeholder={$i18n.t('Enter Bing Search V7 Endpoint')}
											bind:value={webConfig.search.bing_search_v7_endpoint}
											autocomplete="off"
										/>
									</div>
								</div>
							</div>

							<div class="mt-2">
								<div class=" self-center text-xs font-medium mb-1">
									{$i18n.t('Bing Search V7 Subscription Key')}
								</div>

								<SensitiveInput
									placeholder={$i18n.t('Enter Bing Search V7 Subscription Key')}
									bind:value={webConfig.search.bing_search_v7_subscription_key}
								/>
							</div>
						{/if}
					</div>
				{/if}

				{#if webConfig.search.enabled}
					<div class="mt-2 flex gap-2 mb-1">
						<div class="w-full">
							<div class=" self-center text-xs font-medium mb-1">
								{$i18n.t('Search Result Count')}
							</div>

							<input
								class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
								placeholder={$i18n.t('Search Result Count')}
								bind:value={webConfig.search.result_count}
								required
							/>
						</div>

						<div class="w-full">
							<div class=" self-center text-xs font-medium mb-1">
								{$i18n.t('Concurrent Requests')}
							</div>

							<input
								class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
								placeholder={$i18n.t('Concurrent Requests')}
								bind:value={webConfig.search.concurrent_requests}
								required
							/>
						</div>
					</div>
				{/if}

				<div class="mt-2 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<div class="text-xs text-gray-400 dark:text-gray-500">
							{$i18n.t('Run a live test query through the search engine and page fetcher.')}
						</div>
						<button
							class="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-850 dark:hover:bg-gray-800 transition flex items-center gap-1.5 disabled:opacity-50"
							type="button"
							disabled={testing}
							onclick={testHandler}
						>
							{#if testing}
								<Spinner className="size-3.5" />
								{$i18n.t('Testing…')}
							{:else}
								{$i18n.t('Test Connection')}
							{/if}
						</button>
					</div>

					{#if testResult}
						{@const search = testResult.search}
						{@const fetchStage = testResult.fetch}
						<div
							class="rounded-lg border border-gray-100 dark:border-gray-850 p-2.5 text-xs flex flex-col gap-2"
						>
							<!-- Stage 1: search -->
							<div class="flex items-start gap-2">
								<span class={search.ok ? 'text-green-500' : 'text-red-500'}>
									{search.ok ? '✓' : '✕'}
								</span>
								<div class="flex-1 min-w-0">
									<div class="font-medium">
										{$i18n.t('Search')} · {search.engine}
									</div>
									{#if search.error}
										<div class="text-red-500 break-all">{search.error}</div>
									{:else}
										<div class="text-gray-500 dark:text-gray-400">
											{$i18n.t('{{count}} results', { count: search.count })}
										</div>
										{#each search.samples as sample (sample.link)}
											<div class="text-gray-400 dark:text-gray-500 truncate">
												{sample.title || sample.link}
											</div>
										{/each}
									{/if}
									{#if search.unresponsive_engines.length > 0}
										<div class="mt-1 text-amber-600 dark:text-amber-500">
											{$i18n.t('Unresponsive engines:')}
										</div>
										{#each search.unresponsive_engines as ue (ue.engine)}
											<div class="text-amber-600/80 dark:text-amber-500/80 truncate">
												{ue.engine} — {ue.reason}
											</div>
										{/each}
									{/if}
								</div>
							</div>

							<!-- Stage 2: page fetch -->
							<div class="flex items-start gap-2">
								<span
									class={!fetchStage.attempted
										? 'text-gray-400'
										: fetchStage.ok
											? 'text-green-500'
											: 'text-red-500'}
								>
									{!fetchStage.attempted ? '–' : fetchStage.ok ? '✓' : '✕'}
								</span>
								<div class="flex-1 min-w-0">
									<div class="font-medium">{$i18n.t('Page fetch')}</div>
									{#if !fetchStage.attempted}
										<div class="text-gray-500 dark:text-gray-400">
											{$i18n.t('Skipped — no results to fetch')}
										</div>
									{:else if fetchStage.ok}
										<div class="text-gray-500 dark:text-gray-400 truncate">
											{fetchStage.url}
										</div>
										<div class="text-gray-400 dark:text-gray-500">
											{$i18n.t('{{count}} characters retrieved', {
												count: fetchStage.content_chars
											})}
										</div>
									{:else}
										<div class="text-gray-500 dark:text-gray-400 truncate">{fetchStage.url}</div>
										<div class="text-red-500 break-all">{fetchStage.error}</div>
									{/if}
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<hr class=" dark:border-gray-850 my-2" />

			<div>
				<div class=" mb-1 text-sm font-medium">
					{$i18n.t('Web Loader Settings')}
				</div>

				<div>
					<div class=" py-0.5 flex w-full justify-between">
						<div class=" self-center text-xs font-medium">
							{$i18n.t('Bypass SSL verification for Websites')}
						</div>

						<button
							class="p-1 px-3 text-xs flex rounded transition"
							onclick={() => {
								webConfig.web_loader_ssl_verification = !webConfig.web_loader_ssl_verification;
								submitHandler();
							}}
							type="button"
						>
							{#if webConfig.web_loader_ssl_verification === false}
								<span class="ml-2 self-center">{$i18n.t('On')}</span>
							{:else}
								<span class="ml-2 self-center">{$i18n.t('Off')}</span>
							{/if}
						</button>
					</div>
				</div>

				<div class=" mt-2 mb-1 text-sm font-medium">
					{$i18n.t('Youtube Loader Settings')}
				</div>

				<div>
					<div class=" py-0.5 flex w-full justify-between">
						<div class=" w-20 text-xs font-medium self-center">{$i18n.t('Language')}</div>
						<div class=" flex-1 self-center">
							<input
								class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
								type="text"
								placeholder={$i18n.t('Enter language codes')}
								bind:value={youtubeLanguage}
								autocomplete="off"
							/>
						</div>
					</div>
				</div>

				<div>
					<div class=" py-0.5 flex w-full justify-between">
						<div class=" w-20 text-xs font-medium self-center">{$i18n.t('Proxy URL')}</div>
						<div class=" flex-1 self-center">
							<input
								class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
								type="text"
								placeholder={$i18n.t('Enter proxy URL (e.g. https://user:password@host:port)')}
								bind:value={youtubeProxyUrl}
								autocomplete="off"
							/>
						</div>
					</div>
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
