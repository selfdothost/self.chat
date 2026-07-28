<script>
	import { getContext, createEventDispatcher, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const dispatch = createEventDispatcher();
	/** @type {import('svelte/store').Writable<import('i18next').i18n>} */
	const i18n = getContext('i18n');

	import CodeEditor from '$lib/components/common/CodeEditor.svelte';
	import ConfirmDialog from '$lib/components/common/ConfirmDialog.svelte';
	import Badge from '$lib/components/common/Badge.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import ChevronLeft from '$lib/components/icons/ChevronLeft.svelte';
	import { config } from '$lib/stores';

	let formElement = null;
	let showConfirm = false;

	export let edit = false;
	export let clone = false;

	export let id = '';
	export let name = '';
	export let meta = {
		description: ''
	};
	export let content = '';
	let _content = '';

	$: if (content) {
		updateContent();
	}

		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	// eslint-disable-next-line no-useless-assignment
	const updateContent = () => {
		_content = content;
	};

	$: if (name && !edit && !clone) {
		id = name.replace(/\s+/g, '_').toLowerCase();
	}

	let codeEditor;
	let boilerplate = `"""
title: Example Filter
author: your_name
author_url: https://example.com
funding_url: https://example.com
version: 0.1
"""

from pydantic import BaseModel, Field
from typing import Optional


class Filter:
    class Valves(BaseModel):
        priority: int = Field(
            default=0, description="Priority level for the filter operations."
        )
        max_turns: int = Field(
            default=8, description="Maximum allowable conversation turns for a user."
        )
        pass

    class UserValves(BaseModel):
        max_turns: int = Field(
            default=4, description="Maximum allowable conversation turns for a user."
        )
        pass

    def __init__(self):
        # Indicates custom file handling logic. This flag helps disengage default routines in favor of custom
        # implementations, informing the WebUI to defer file-related operations to designated methods within this class.
        # Alternatively, you can remove the files directly from the body in from the inlet hook
        # self.file_handler = True

        # Initialize 'valves' with specific configurations. Using 'Valves' instance helps encapsulate settings,
        # which ensures settings are managed cohesively and not confused with operational flags like 'file_handler'.
        self.valves = self.Valves()
        pass

    def inlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        # Modify the request body or validate it before processing by the chat completion API.
        # This function is the pre-processor for the API where various checks on the input can be performed.
        # It can also modify the request before sending it to the API.
        print(f"inlet:{__name__}")
        print(f"inlet:body:{body}")
        print(f"inlet:user:{__user__}")

        if __user__.get("role", "admin") in ["user", "admin"]:
            messages = body.get("messages", [])

            max_turns = min(__user__["valves"].max_turns, self.valves.max_turns)
            if len(messages) > max_turns:
                raise Exception(
                    f"Conversation turn limit exceeded. Max turns: {max_turns}"
                )

        return body

    def outlet(self, body: dict, __user__: Optional[dict] = None) -> dict:
        # Modify or analyze the response body after processing by the API.
        # This function is the post-processor for the API, which can be used to modify the response
        # or perform additional checks and analytics.
        print(f"outlet:{__name__}")
        print(f"outlet:body:{body}")
        print(f"outlet:user:{__user__}")

        return body
`;

	const saveHandler = async () => {
		dispatch('save', {
			id,
			name,
			meta,
			content
		});
	};

	const submitHandler = async () => {
		if (codeEditor) {
			content = _content;
			await tick();

			const res = await codeEditor.formatPythonCodeHandler();
			await tick();

			content = _content;
			await tick();

			if (res) {
				console.log('Code formatted successfully');

				saveHandler();
			}
		}
	};
</script>

<div class=" flex flex-col justify-between w-full overflow-y-auto h-full">
	<div class="mx-auto w-full md:px-0 h-full">
		<form
			bind:this={formElement}
			class=" flex flex-col max-h-[100dvh] h-full"
			on:submit|preventDefault={() => {
				// Always confirm before running unsandboxed code, on both create
				// and edit -- editing an existing function's code is exactly when a
				// dangerous payload could be introduced, not just at creation.
				showConfirm = true;
			}}
		>
			<div class="flex flex-col flex-1 overflow-auto h-0 rounded-lg">
				<div class="w-full mb-2 flex flex-col gap-0.5">
					<div class="flex w-full items-center">
						<div class=" flex-shrink-0 mr-2">
							<Tooltip content={$i18n.t('Back')}>
								<button
									class="w-full text-left text-sm py-1.5 px-1 rounded-lg dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-gray-850"
									on:click={() => {
										goto(resolve('/(app)/admin/functions'));
									}}
									type="button"
								>
									<ChevronLeft strokeWidth="2.5" />
								</button>
							</Tooltip>
						</div>

						<div class="flex-1">
							<Tooltip content={$i18n.t('e.g. My Filter')} placement="top-start">
								<input
									class="w-full text-2xl font-medium bg-transparent outline-none font-primary"
									type="text"
									placeholder={$i18n.t('Function Name')}
									bind:value={name}
									required
								/>
							</Tooltip>
						</div>

						<div>
							<Badge type="muted" content={$i18n.t('Function')} />
						</div>
					</div>

					<div class=" flex gap-2 px-1 items-center">
						{#if edit}
							<div class="text-sm text-gray-500 flex-shrink-0">
								{id}
							</div>
						{:else}
							<Tooltip className="w-full" content={$i18n.t('e.g. my_filter')} placement="top-start">
								<input
									class="w-full text-sm disabled:text-gray-500 bg-transparent outline-none"
									type="text"
									placeholder={$i18n.t('Function ID')}
									bind:value={id}
									required
									disabled={edit}
								/>
							</Tooltip>
						{/if}

						<Tooltip
							className="w-full self-center items-center flex"
							content={$i18n.t('e.g. A filter to remove profanity from text')}
							placement="top-start"
						>
							<input
								class="w-full text-sm bg-transparent outline-none"
								type="text"
								placeholder={$i18n.t('Function Description')}
								bind:value={meta.description}
								required
							/>
						</Tooltip>
					</div>
				</div>

				<div class="mb-2 flex-1 overflow-auto h-0 rounded-lg">
					<CodeEditor
						bind:this={codeEditor}
						value={content}
						lang="python"
						{boilerplate}
						on:change={(e) => {
							_content = e.detail.value;
						}}
						on:save={async () => {
							if (formElement) {
								formElement.requestSubmit();
							}
						}}
					/>
				</div>

				<div class="pb-3 flex justify-between">
					<div class="flex-1 pr-3">
						<div class="text-xs text-gray-500 line-clamp-2">
							<span class=" font-semibold dark:text-gray-200">{$i18n.t('Warning:')}</span>
							{$i18n.t('Functions allow arbitrary code execution')}
							{#if !$config?.features?.enable_piston_execution}
								{$i18n.t('(no sandbox is active on this instance)')}
							{/if}
							<br />—
							<span class=" font-medium dark:text-gray-400"
								>{$i18n.t(`don't install random functions from sources you don't trust.`)}</span
							>
						</div>
					</div>

					<button
						class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
						type="submit"
					>
						{$i18n.t('Save')}
					</button>
				</div>
			</div>
		</form>
	</div>
</div>

<ConfirmDialog
	bind:show={showConfirm}
	on:confirm={() => {
		submitHandler();
	}}
>
	<div class="text-sm text-gray-500">
		<div class=" bg-yellow-500/20 text-yellow-700 dark:text-yellow-200 rounded-lg px-4 py-3">
			<div class="font-semibold">
				{$i18n.t('This could be dangerous. Please use caution.')}
			</div>
			<div class="mt-1">{$i18n.t('Please carefully review the following warnings:')}</div>

			<ul class=" mt-1 list-disc pl-4 text-xs">
				<li>{$i18n.t('Functions allow arbitrary code execution.')}</li>
				<li>{$i18n.t('Do not install functions from sources you do not fully trust.')}</li>
				{#if !$config?.features?.enable_piston_execution}
					<li>
						{$i18n.t(
							'No sandboxed execution backend (Piston) is configured on this instance -- this code will run directly in the server process with no isolation.'
						)}
					</li>
				{/if}
			</ul>
		</div>

		<div class="my-3">
			{$i18n.t(
				'I acknowledge that I have read and I understand the implications of my action. I am aware of the risks associated with executing arbitrary code and I have verified the trustworthiness of the source.'
			)}
		</div>
	</div>
</ConfirmDialog>
