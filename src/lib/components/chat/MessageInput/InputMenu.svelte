<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import { getContext, tick } from 'svelte';

	import { config, tools as _tools, mobile } from '$lib/stores';
	import { getTools } from '$lib/apis/tools';

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import DocumentArrowUpSolid from '$lib/components/icons/DocumentArrowUpSolid.svelte';
	import Switch from '$lib/components/common/Switch.svelte';
	import GlobeAltSolid from '$lib/components/icons/GlobeAltSolid.svelte';
	import Cog6Solid from '$lib/components/icons/Cog6Solid.svelte';
	import WrenchSolid from '$lib/components/icons/WrenchSolid.svelte';
	import CameraSolid from '$lib/components/icons/CameraSolid.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	export let screenCaptureHandler: AnyFn;
	export let uploadFilesHandler: AnyFn;
	export let uploadGoogleDriveHandler: AnyFn;

	export let selectedToolIds: string[] = [];

	export let webSearchEnabled: boolean;
	export let deepResearchEnabled: boolean = false;
	export let webCrawlEnabled: boolean = false;
	/** The knowledge base crawled pages are saved into. '' means unconfigured. */
	export let webCrawlKbId: string = '';
	/** Opens the Configure modal (owned by the parent, so it survives this dropdown closing). */
	export let onConfigureWebCrawl: AnyFn = () => {};
	export let onClose: AnyFn;

	let tools = {};
	let show = false;

	$: if (show) {
		init();
	}

		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	// eslint-disable-next-line no-useless-assignment
	const init = async () => {
		if ($_tools === null) {
			await _tools.set(await getTools(localStorage.token));
		}

		tools = $_tools.reduce((a, tool, _i, _arr) => {
			a[tool.id] = {
				name: tool.name,
				description: tool.meta.description,
				enabled: selectedToolIds.includes(tool.id)
			};
			return a;
		}, {});
	};
</script>

<Dropdown
	bind:show
	on:change={(e) => {
		if (e.detail === false) {
			onClose();
		}
	}}
>
	<Tooltip content={$i18n.t('More')}>
		<slot />
	</Tooltip>

	<div slot="content">
		<DropdownMenuContent
			class="w-full max-w-[275px] rounded-xl px-1 py-1  border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow"
			sideOffset={15}
			alignOffset={-8}
			side="top"
			align="start"
		>
			{#if Object.keys(tools).length > 0}
				<div class="  max-h-28 overflow-y-auto scrollbar-hidden">
					{#each Object.keys(tools) as toolId (toolId)}
						<button
							class="flex w-full justify-between gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer rounded-xl"
							on:click={() => {
								tools[toolId].enabled = !tools[toolId].enabled;
							}}
						>
							<div class="flex-1 truncate">
								<Tooltip
									content={tools[toolId]?.description ?? ''}
									placement="top-start"
									className="flex flex-1 gap-2 items-center"
								>
									<div class="flex-shrink-0">
										<WrenchSolid />
									</div>

									<div class=" truncate">{tools[toolId].name}</div>
								</Tooltip>
							</div>

							<div class=" flex-shrink-0">
								<Switch
									state={tools[toolId].enabled}
									on:change={async (e) => {
										const state = e.detail;
										await tick();
										if (state) {
											selectedToolIds = [...selectedToolIds, toolId];
										} else {
											selectedToolIds = selectedToolIds.filter((id) => id !== toolId);
										}
									}}
								/>
							</div>
						</button>
					{/each}
				</div>

				<hr class="border-black/5 dark:border-white/5 my-1" />
			{/if}

			{#if $config?.features?.enable_web_search}
				<button
					class="flex w-full justify-between gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer rounded-xl"
					on:click={() => {
						webSearchEnabled = !webSearchEnabled;
					}}
				>
					<div class="flex-1 flex items-center gap-2">
						<GlobeAltSolid />
						<div class="text-left line-clamp-1">{$i18n.t('Web Search')}</div>
					</div>

					<Switch state={webSearchEnabled} />
				</button>

				<hr class="border-black/5 dark:border-white/5 my-1" />
			{/if}

			{#if $config?.features?.enable_deep_research}
				<button
					class="flex w-full justify-between gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer rounded-xl"
					on:click={() => {
						deepResearchEnabled = !deepResearchEnabled;
					}}
				>
					<div class="flex-1 flex items-center gap-2">
						<GlobeAltSolid />
						<div class="text-left line-clamp-1">{$i18n.t('Deep Research')}</div>
					</div>

					<Switch state={deepResearchEnabled} />
				</button>

				<hr class="border-black/5 dark:border-white/5 my-1" />
			{/if}

			{#if $config?.features?.enable_web_crawl}
				<div
					class="flex w-full justify-between gap-2 items-center px-3 py-2 text-sm font-medium rounded-xl"
				>
					<button
						class="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
						on:click={() => {
							// Enabling without a destination is not a valid state, so the
							// modal opens instead of the switch flipping. If the user picks
							// nothing, the parent leaves this off.
							if (!webCrawlEnabled && !webCrawlKbId) {
								onConfigureWebCrawl();
							} else {
								webCrawlEnabled = !webCrawlEnabled;
							}
						}}
					>
						<GlobeAltSolid />
						<div class="text-left line-clamp-1">{$i18n.t('Web Crawl')}</div>
					</button>

					<button
						class="shrink-0 p-1 rounded-lg text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition"
						title={$i18n.t('Configure Web Crawl')}
						aria-label={$i18n.t('Configure Web Crawl')}
						on:click|stopPropagation={() => onConfigureWebCrawl()}
					>
						<Cog6Solid className="size-3.5" />
					</button>

					<!-- Switch is a real bits-ui control, not decoration: it renders its
					     own button and handles its own click. Wrapping it in another
					     button would nest buttons and double-fire, so drive it by its
					     `change` event instead. -->
					<Switch
						state={webCrawlEnabled}
						on:change={(e) => {
							if (e.detail && !webCrawlKbId) {
								// Turning on with no destination: open the modal and leave the
								// toggle off. The modal's outcome decides.
								onConfigureWebCrawl();
							} else {
								webCrawlEnabled = e.detail;
							}
						}}
					/>
				</div>

				<hr class="border-black/5 dark:border-white/5 my-1" />
			{/if}

			{#if !$mobile}
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm  font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800  rounded-xl"
					onSelect={() => {
						screenCaptureHandler();
					}}
				>
					<CameraSolid />
					<div class=" line-clamp-1">{$i18n.t('Capture')}</div>
				</DropdownMenu.Item>
			{/if}

			<DropdownMenu.Item
				class="flex gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl"
				onSelect={() => {
					uploadFilesHandler();
				}}
			>
				<DocumentArrowUpSolid />
				<div class="line-clamp-1">{$i18n.t('Upload Files')}</div>
			</DropdownMenu.Item>

			{#if $config?.features?.enable_google_drive_integration}
				<DropdownMenu.Item
					class="flex gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl"
					onSelect={() => {
						uploadGoogleDriveHandler();
					}}
				>
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 87.3 78" class="w-5 h-5">
						<path
							d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"
							fill="#0066da"
						/>
						<path
							d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z"
							fill="#00ac47"
						/>
						<path
							d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z"
							fill="#ea4335"
						/>
						<path
							d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"
							fill="#00832d"
						/>
						<path
							d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"
							fill="#2684fc"
						/>
						<path
							d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"
							fill="#ffba00"
						/>
					</svg>
					<div class="line-clamp-1">{$i18n.t('Google Drive')}</div>
				</DropdownMenu.Item>
			{/if}
		</DropdownMenuContent>
	</div>
</Dropdown>
