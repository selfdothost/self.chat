<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { config } from '$lib/stores';
	import Switch from '$lib/components/common/Switch.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import type { ModScopesResponse } from '$lib/apis/mods';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';

	// A mod permissions subtree is boolean leaves nested arbitrarily deep
	// (one level per scope-id segment) -- see scopePath()/getModScopeState()
	// below for why depth isn't fixed at one level.
	type ModPermissionNode = boolean | { [key: string]: ModPermissionNode };

	export let permissions: {
		workspace: {
			models: boolean;
			knowledge: boolean;
			prompts: boolean;
			training: boolean;
			evaluations: boolean;
			tools: boolean;
		};
		chat: {
			delete: boolean;
			edit: boolean;
			temporary: boolean;
			file_upload: boolean;
		};
		// Nested per-mod scope grants (self.ai#69) -- one boolean leaf per
		// declared scope, keyed by the scope id's segments. Optional/untyped
		// because its shape is only known once mods with declared scopes are
		// loaded (see `mods` prop below).
		mods?: Record<string, ModPermissionNode>;
	} = {
		workspace: {
			models: false,
			knowledge: false,
			prompts: false,
			training: false,
			evaluations: false,
			tools: false
		},
		chat: {
			delete: true,
			edit: true,
			temporary: true,
			file_upload: true
		}
	};

	// Every loaded mod's declared scopes (self.ai#69) -- each scope id is a
	// dotted key ("mods.<mod id>.<...>") walked by the same has_permission()
	// core uses for every other permission, so a mod scope is just another
	// nested boolean under permissions.mods.<mod id>. `path` is that id's
	// segments after "mods.<mod id>." -- usually one segment (e.g. ["use"])
	// but a mod may declare a deeper scope, so this walks arbitrary depth
	// rather than assuming one level.
	export let mods: ModScopesResponse[] = [];

	const scopePath = (scopeId: string, modId: string): string[] => {
		const prefix = `mods.${modId}.`;
		return scopeId.startsWith(prefix) ? scopeId.slice(prefix.length).split('.') : [];
	};

	const getModScopeState = (modId: string, path: string[]): boolean => {
		let node: ModPermissionNode | undefined = permissions?.mods?.[modId];
		for (const key of path) {
			if (node == null || typeof node !== 'object') return false;
			node = node[key];
		}
		return !!node;
	};

	const setModScopeState = (modId: string, path: string[], value: boolean) => {
		if (!permissions.mods) permissions.mods = {};
		if (!permissions.mods[modId]) permissions.mods[modId] = {};
		let node: { [key: string]: ModPermissionNode } = permissions.mods[modId] as {
			[key: string]: ModPermissionNode;
		};
		for (let i = 0; i < path.length - 1; i++) {
			if (typeof node[path[i]] !== 'object' || node[path[i]] === null) {
				node[path[i]] = {};
			}
			node = node[path[i]] as { [key: string]: ModPermissionNode };
		}
		node[path[path.length - 1]] = value;
		permissions = permissions;
	};

	let showToolsWarning = false;
	let toolsWarningEverOpened = false;
	let toolsAccessConfirmed = false;

	// Turning this on lets non-admin users run arbitrary Python on the server
	// (see context/treasuremaps/2026-07-20-tools-piston-sandboxing.md). A
	// hover tooltip is too easy to miss for something this consequential --
	// require an explicit acknowledgment before the switch actually flips on.
	const handleToolsAccessChange = (checked: boolean) => {
		if (checked) {
			toolsAccessConfirmed = false;
			toolsWarningEverOpened = true;
			showToolsWarning = true;
		}
	};

	// ConfirmDialog can close via Confirm, Cancel, Escape, or a backdrop
	// click -- only Escape/backdrop fire no event at all, and Confirm's own
	// `show = false` flushes to this binding *before* its 'confirm' event
	// dispatches (both happen within the same synchronous handler, one
	// microtask apart), so checking synchronously here would misfire on
	// every confirm. Deferring to a macrotask guarantees any in-flight
	// confirm has already set toolsAccessConfirmed by the time this runs.
	$: if (toolsWarningEverOpened && !showToolsWarning) {
		setTimeout(() => {
			if (!toolsAccessConfirmed) {
				permissions.workspace.tools = false;
			}
		}, 0);
	}
</script>

<ConfirmDialog
	bind:show={showToolsWarning}
	title={$i18n.t('Enable Tools Access?')}
	confirmLabel={$i18n.t('Enable Tools Access')}
	on:confirm={() => {
		toolsAccessConfirmed = true;
	}}
>
	<div class="text-sm text-gray-500">
		<div class=" bg-yellow-500/20 text-yellow-700 dark:text-yellow-200 rounded-lg px-4 py-3">
			<div class="font-semibold">{$i18n.t('This could be dangerous. Please use caution.')}</div>
			<div class="mt-1">
				{$i18n.t(
					'Tools are a function calling system with arbitrary code execution. Enabling this grants every user in this scope the ability to write and run Python code on this server.'
				)}
			</div>
			{#if !$config?.features?.enable_piston_execution}
				<div class="mt-1">
					{$i18n.t(
						'No sandboxed execution backend (Piston) is configured on this instance -- Tool code runs directly in the server process with no isolation.'
					)}
				</div>
			{/if}
		</div>
	</div>
</ConfirmDialog>

<div>
	<!-- <div>
		<div class=" mb-2 text-sm font-medium">{$i18n.t('Model Permissions')}</div>

		<div class="mb-2">
			<div class="flex justify-between items-center text-xs pr-2">
				<div class=" text-xs font-medium">{$i18n.t('Model Filtering')}</div>

				<Switch bind:state={permissions.model.filter} />
			</div>
		</div>

		{#if permissions.model.filter}
			<div class="mb-2">
				<div class=" space-y-1.5">
					<div class="flex flex-col w-full">
						<div class="mb-1 flex justify-between">
							<div class="text-xs text-gray-500">{$i18n.t('Model IDs')}</div>
						</div>

						{#if model_ids.length > 0}
							<div class="flex flex-col">
								{#each model_ids as modelId, modelIdx}
									<div class=" flex gap-2 w-full justify-between items-center">
										<div class=" text-sm flex-1 rounded-lg">
											{modelId}
										</div>
										<div class="flex-shrink-0">
											<button
												type="button"
												on:click={() => {
													model_ids = model_ids.filter((_, idx) => idx !== modelIdx);
												}}
											>
												<Minus strokeWidth="2" className="size-3.5" />
											</button>
										</div>
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-gray-500 text-xs text-center py-2 px-10">
								{$i18n.t('No model IDs')}
							</div>
						{/if}
					</div>
				</div>
				<hr class=" border-gray-100 dark:border-gray-700/10 mt-2.5 mb-1 w-full" />

				<div class="flex items-center">
					<select
						class="w-full py-1 text-sm rounded-lg bg-transparent {selectedModelId
							? ''
							: 'text-gray-500'} placeholder:text-gray-300 dark:placeholder:text-gray-700 outline-none"
						bind:value={selectedModelId}
					>
						<option value="">{$i18n.t('Select a model')}</option>
						{#each $models.filter((m) => m?.owned_by !== 'arena') as model}
							<option value={model.id} class="bg-gray-50 dark:bg-gray-700">{model.name}</option>
						{/each}
					</select>

					<div>
						<button
							type="button"
							on:click={() => {
								if (selectedModelId && !permissions.model.model_ids.includes(selectedModelId)) {
									permissions.model.model_ids = [...permissions.model.model_ids, selectedModelId];
									selectedModelId = '';
								}
							}}
						>
							<Plus className="size-3.5" strokeWidth="2" />
						</button>
					</div>
				</div>
			</div>
		{/if}

		<div class=" space-y-1 mb-3">
			<div class="">
				<div class="flex justify-between items-center text-xs">
					<div class=" text-xs font-medium">{$i18n.t('Default Model')}</div>
				</div>
			</div>

			<div class="flex-1 mr-2">
				<select
					class="w-full bg-transparent outline-none py-0.5 text-sm"
					bind:value={permissions.model.default_id}
					placeholder="Select a model"
				>
					<option value="" disabled selected>{$i18n.t('Select a model')}</option>
					{#each permissions.model.filter ? $models.filter( (model) => filterModelIds.includes(model.id) ) : $models.filter((model) => model.id) as model}
						<option value={model.id} class="bg-gray-100 dark:bg-gray-700">{model.name}</option>
					{/each}
				</select>
			</div>
		</div>
	</div>

	<hr class=" border-gray-50 dark:border-gray-850 my-2" /> -->

	<div>
		<div class=" mb-2 text-sm font-medium">{$i18n.t('Workspace Permissions')}</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Models Access')}
			</div>
			<Switch bind:state={permissions.workspace.models} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Knowledge Access')}
			</div>
			<Switch bind:state={permissions.workspace.knowledge} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Prompts Access')}
			</div>
			<Switch bind:state={permissions.workspace.prompts} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Training Access')}
			</div>
			<Switch bind:state={permissions.workspace.training} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Evaluations Access')}
			</div>
			<Switch bind:state={permissions.workspace.evaluations} />
		</div>

		<div class=" ">
			<Tooltip
				className=" flex w-full justify-between my-2 pr-2"
				content={$config?.features?.enable_piston_execution
					? $i18n.t('Enabling this will allow users to run code on the server via the sandboxed Piston backend.')
					: $i18n.t(
							'Warning: this could be dangerous. Enabling this will allow users to run arbitrary code directly on the server, with no sandboxing.'
						)}
				placement="top-start"
			>
				<div class=" self-center text-xs font-medium">
					{$i18n.t('Tools Access')}
				</div>
				<Switch
					bind:state={permissions.workspace.tools}
					on:change={(e) => handleToolsAccessChange(e.detail)}
				/>
			</Tooltip>
		</div>
	</div>

	<hr class=" border-gray-50 dark:border-gray-850 my-2" />

	<div>
		<div class=" mb-2 text-sm font-medium">{$i18n.t('Chat Permissions')}</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Allow File Upload')}
			</div>

			<Switch bind:state={permissions.chat.file_upload} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Allow Chat Delete')}
			</div>

			<Switch bind:state={permissions.chat.delete} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Allow Chat Edit')}
			</div>

			<Switch bind:state={permissions.chat.edit} />
		</div>

		<div class="  flex w-full justify-between my-2 pr-2">
			<div class=" self-center text-xs font-medium">
				{$i18n.t('Allow Temporary Chat')}
			</div>

			<Switch bind:state={permissions.chat.temporary} />
		</div>
	</div>

	{#if mods.length > 0}
		<hr class=" border-gray-50 dark:border-gray-850 my-2" />

		<div>
			<div class=" mb-2 text-sm font-medium">{$i18n.t('Mod Permissions')}</div>

			{#each mods as mod (mod.id)}
				<div class="mb-2">
					<div class=" mb-1 text-xs text-gray-500 dark:text-gray-400">{mod.name}</div>

					{#each mod.scopes as scope (scope.id)}
						<div class="  flex w-full justify-between my-2 pr-2">
							<div class=" self-center text-xs font-medium">
								{scope.desc}
							</div>
							<Switch
								state={getModScopeState(mod.id, scopePath(scope.id, mod.id))}
								on:change={(e) =>
									setModScopeState(mod.id, scopePath(scope.id, mod.id), e.detail)}
							/>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</div>
