<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import type { AnyFn } from '$lib/types';

	import { models, tools, knowledge as knowledgeCollections, config } from '$lib/stores';
	import { getTools } from '$lib/apis/tools';
	import { getKnowledgeBases } from '$lib/apis/knowledge';
	import { updateFolderPresetById } from '$lib/apis/folders';

	import Modal from '$lib/components/common/Modal.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';

	// Reuse existing pickers verbatim (FC/R2, FC/R6) -- no new picker UI here.
	// (1) the chat composer's single-model picker PRIMITIVE (bound to one model id),
	//     not the ModelSelector wrapper that carries composer-specific side effects;
	// (2) the Workspace tool-set picker (bound to a plain array of tool ids);
	// (3) the Workspace Knowledge picker (bound to full knowledge objects).
	import ModelSelectorPrimitive from '$lib/components/chat/ModelSelector/Selector.svelte';
	import ToolsSelector from '$lib/components/workspace/Models/ToolsSelector.svelte';
	import Knowledge from '$lib/components/workspace/Models/Knowledge.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	// Reserved tool_id standing in for the Web Search toggle (self.ai's
	// BUILTIN_TOOL_IDS) -- not a row in the tool table, so it's injected here as
	// a synthetic entry rather than surfaced by ToolsSelector's own `tools`
	// prop (which only ever reflects real custom-tool rows from getTools()).
	const WEB_SEARCH_TOOL_ID = 'web_search';

	// Visibility is a bound boolean -- the same idiom the folder's delete-confirmation
	

	// The folder whose preset is being configured (used for pre-population in T-003
	// and persistence in T-004).
	
	interface Props {
		// modal uses (FC/R2).
		show?: boolean;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		folder?: any;
		onSave?: AnyFn;
	}

	let { show = $bindable(false), folder = null, onSave = () => {} }: Props = $props();

	// Picker-bound selection state.
	let selectedModelId = $state('');
	let selectedToolIds: string[] = $state([]);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let selectedKnowledge: any[] = $state([]);

	// Gate picker rendering until backing option data (and any pre-populated
	// selections) are ready, so each picker mounts with its full option set and
	// initial selection in one shot (FC/R2: options populated before/as open).
	let optionsLoaded = $state(false);

	// A single generic error surfaced on a rejected save (FC/R4). Never carries
	// per-field or missing-vs-inaccessible detail.
	let saveError = $state('');
	let saving = $state(false);

	const saveHandler = async () => {
		saving = true;
		saveError = '';

		// Always submit all three fields together so an emptied field is an explicit
		// clear, not a merge-on-omit (FC/R4, FC/R5). No per-field client-side
		// reference validation runs before submit -- the backend is authoritative.
		const res = await updateFolderPresetById(localStorage.token, folder?.id, {
			// The backend's folder-update endpoint requires name (it's the same
			// rename endpoint); a preset-only save resubmits the folder's own
			// current, unchanged name (not treated as a self-collision).
			name: folder?.name,
			default_model_id: selectedModelId ? selectedModelId : null,
			tool_ids: selectedToolIds,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			knowledge_ids: selectedKnowledge.map((k: any) => k.id)
		}).catch(() => {
			// One generic error, regardless of what the backend rejected.
			saveError = $i18n.t('Failed to save configuration. Please try again.');
			return null;
		});

		saving = false;

		if (res) {
			onSave(res);
			show = false;
		}
	};

	const loadOptions = async () => {
		// Ensure the pickers' backing data is populated. Models are already in the
		// global store; tools and knowledge collections are fetched on open.
		const [toolList, knowledgeList] = await Promise.all([
			getTools(localStorage.token).catch(() => null),
			getKnowledgeBases(localStorage.token).catch(() => null)
		]);

		if (toolList) {
			await tools.set(toolList);
		}
		if (knowledgeList) {
			await knowledgeCollections.set(knowledgeList);
		}

		// Pre-populate from the folder's stored preset (FC/R3). A folder with no
		// preset opens fully empty/unselected. Seeding happens BEFORE the pickers
		// mount (gated by optionsLoaded) so each reflects its initial selection in
		// one shot -- no re-pick needed to preserve a stored value on save.
		const preset = folder?.meta?.preset ?? {};

		selectedModelId = preset.default_model_id ?? '';
		selectedToolIds = Array.isArray(preset.tool_ids) ? [...preset.tool_ids] : [];

		// Knowledge picker binds full objects: resolve stored ids against the loaded
		// collections. A stored id present in the option set appears pre-selected.
		const availableKnowledge = knowledgeList ?? $knowledgeCollections ?? [];
		const knowledgeIds: string[] = Array.isArray(preset.knowledge_ids)
			? preset.knowledge_ids
			: [];
		selectedKnowledge = knowledgeIds
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			.map((id: string) => availableKnowledge.find((k: any) => k.id === id))
			.filter((k) => k);

		saveError = '';
		// This assignment is what the reactive block below reads via
		// `{#if optionsLoaded}` in the template -- the block's own trigger
		// condition is `show` alone (see the disable/enable note there), so
		// this can't retrigger loadOptions(); not an infinite loop.
		 
		optionsLoaded = true;
	};

	// When the modal opens, (re)load options and reset the picker-render gate.
	// The block's own condition only reads `show` (not `optionsLoaded`), so it
	// only re-runs when `show` itself changes -- matching the established
	// load-on-open pattern in ArchivedChatsModal.svelte/ShareChatModal.svelte.
	$effect(() => {
		if (show) {
			loadOptions();
		} else {
			optionsLoaded = false;
		}
	});

	// Web Search only appears as a selectable "tool" when the admin currently has
	// it enabled system-wide ($config.features.enable_web_search) -- the same gate
	// InputMenu.svelte's composer toggle uses, and the same gate the backend
	// enforces on save (self.ai's resolve_tool_ref).
	let toolsForSelector = $derived($config?.features?.enable_web_search
		? [...$tools, { id: WEB_SEARCH_TOOL_ID, name: $i18n.t('Web Search') }]
		: $tools);
</script>

<Modal bind:show size="sm">
	<div class="px-6 py-5 flex flex-col">
		<div class="flex justify-between items-center mb-4">
			<div class="text-lg font-semibold dark:text-gray-200">
				{$i18n.t('Configure')}
			</div>
		</div>

		{#if optionsLoaded}
			<div class="flex flex-col gap-4">
				<div>
					<div class="flex items-center justify-between mb-1">
						<div class="text-sm font-semibold dark:text-gray-200">{$i18n.t('Default Model')}</div>
						{#if selectedModelId}
							<!-- Explicit clear for the single-model picker (which has no
							     deselect); emptying + save clears the stored default (FC/R5). -->
							<button
								type="button"
								class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
								onclick={() => {
									selectedModelId = '';
								}}
							>
								{$i18n.t('Remove')}
							</button>
						{/if}
					</div>
					<ModelSelectorPrimitive
						id="folder-config-model"
						placeholder={$i18n.t('Select a model')}
						items={$models.map((model) => ({
							value: model.id,
							label: model.name,
							model: model
						}))}
						className="w-full"
						triggerClassName="text-sm dark:text-gray-100"
						bind:value={selectedModelId}
					/>
				</div>

				<ToolsSelector bind:selectedToolIds tools={toolsForSelector} />

				<Knowledge bind:selectedKnowledge collections={$knowledgeCollections} />
			</div>
		{:else}
			<div class="flex justify-center py-8">
				<Spinner className="size-5" />
			</div>
		{/if}

		{#if saveError}
			<div class="mt-4 text-sm text-red-500" role="alert">
				{saveError}
			</div>
		{/if}

		<div class="mt-6 flex justify-end gap-1.5">
			<button
				class="bg-gray-100 hover:bg-gray-200 text-gray-800 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white font-medium px-4 py-2 rounded-lg transition"
				type="button"
				onclick={() => {
					show = false;
				}}
			>
				{$i18n.t('Cancel')}
			</button>
			<button
				class="bg-gray-900 hover:bg-gray-850 text-gray-100 dark:bg-gray-100 dark:hover:bg-white dark:text-gray-800 font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
				type="button"
				disabled={saving || !optionsLoaded}
				onclick={saveHandler}
			>
				{$i18n.t('Save')}
			</button>
		</div>
	</div>
</Modal>
