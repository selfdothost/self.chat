<script lang="ts">
	import { preventDefault } from 'svelte/legacy';

	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { toast } from 'svelte-sonner';

	import { functions, tools } from '$lib/stores';
	import { getContext, tick } from 'svelte';

	import {
		getUserValvesSpecById as getToolUserValvesSpecById,
		getUserValvesById as getToolUserValvesById,
		updateUserValvesById as updateToolUserValvesById,
		getTools
	} from '$lib/apis/tools';
	import {
		getUserValvesSpecById as getFunctionUserValvesSpecById,
		getUserValvesById as getFunctionUserValvesById,
		updateUserValvesById as updateFunctionUserValvesById,
		getFunctions
	} from '$lib/apis/functions';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import Valves from '$lib/components/common/Valves.svelte';


	const i18n: Writable<i18nType> = getContext('i18n');

	interface Props {
		show?: boolean;
	}

	let { show = false }: Props = $props();

	let tab = $state('tools');
	let selectedId = $state('');

	let loading = $state(false);

	let valvesSpec = $state(null);
	let valves = $state({});

	let debounceTimer;

	const debounceSubmitHandler = async () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		// Set a new timer
		debounceTimer = setTimeout(() => {
			submitHandler();
		}, 500); // 0.5 second debounce
	};

	const getUserValves = async () => {
		loading = true;
		if (tab === 'tools') {
			valves = await getToolUserValvesById(localStorage.token, selectedId);
			valvesSpec = await getToolUserValvesSpecById(localStorage.token, selectedId);
		} else if (tab === 'functions') {
			valves = await getFunctionUserValvesById(localStorage.token, selectedId);
			valvesSpec = await getFunctionUserValvesSpecById(localStorage.token, selectedId);
		}

		if (valvesSpec) {
			// Convert array to string
			for (const property in valvesSpec.properties) {
				if (valvesSpec.properties[property]?.type === 'array') {
					valves[property] = (valves[property] ?? []).join(',');
				}
			}
		}

		loading = false;
	};

	const submitHandler = async () => {
		if (valvesSpec) {
			// Convert string to array
			for (const property in valvesSpec.properties) {
				if (valvesSpec.properties[property]?.type === 'array') {
					valves[property] = (valves[property] ?? '').split(',').map((v) => v.trim());
				}
			}

			if (tab === 'tools') {
				const res = await updateToolUserValvesById(localStorage.token, selectedId, valves).catch(
					(error) => {
						toast.error(error);
						return null;
					}
				);

				if (res) {
					toast.success($i18n.t('Valves updated'));
					valves = res;
				}
			} else if (tab === 'functions') {
				const res = await updateFunctionUserValvesById(
					localStorage.token,
					selectedId,
					valves
				).catch((error) => {
					toast.error(error);
					return null;
				});

				if (res) {
					toast.success($i18n.t('Valves updated'));
					valves = res;
				}
			}
		}
	};




		// Svelte compiles $: blocks in dependency order, not source order --
	// this is called from an earlier reactive block despite being declared
	// here. ESLint's static top-down analysis can't see that reordering.
	 
	const init = async () => {
		loading = true;

		if ($functions === null) {
			functions.set(await getFunctions(localStorage.token));
		}
		if ($tools === null) {
			tools.set(await getTools(localStorage.token));
		}

		loading = false;
	};
	$effect(() => {
		if (tab) {
			selectedId = '';
		}
	});
	$effect(() => {
		if (selectedId) {
			getUserValves();
		}
	});
	$effect(() => {
		if (show) {
			init();
		}
	});
</script>

{#if show && !loading}
	<form
		class="flex flex-col h-full justify-between space-y-3 text-sm"
		onsubmit={preventDefault(() => {
			// A 'save' event was emitted here. Nothing has ever listened: the sole
			// mount is `<Valves show={showValves} />` in Controls.svelte, with no
			// handler, and no listener for a save event exists anywhere for it.
			// Removed with the dispatcher rather than promoted to a prop nobody
			// passes. submitHandler() already persists and toasts.
			submitHandler();
		})}
	>
		<div class="flex flex-col">
			<div class="space-y-1">
				<div class="flex gap-2">
					<div class="flex-1">
						<select
							class="  w-full rounded text-xs py-2 px-1 bg-transparent outline-hidden"
							bind:value={tab}
							placeholder="Select"
						>
							<option value="tools" class="bg-gray-100 dark:bg-gray-800">{$i18n.t('Tools')}</option>
							<option value="functions" class="bg-gray-100 dark:bg-gray-800"
								>{$i18n.t('Functions')}</option
							>
						</select>
					</div>

					<div class="flex-1">
						<select
							class="w-full rounded py-2 px-1 text-xs bg-transparent outline-hidden"
							bind:value={selectedId}
							onchange={async () => {
								await tick();
							}}
						>
							{#if tab === 'tools'}
								<option value="" selected disabled class="bg-gray-100 dark:bg-gray-800"
									>{$i18n.t('Select a tool')}</option
								>

								{#each $tools as tool, _toolIdx (tool.id)}
									<option value={tool.id} class="bg-gray-100 dark:bg-gray-800">{tool.name}</option>
								{/each}
							{:else if tab === 'functions'}
								<option value="" selected disabled class="bg-gray-100 dark:bg-gray-800"
									>{$i18n.t('Select a function')}</option
								>

								{#each $functions as func, _funcIdx (func.id)}
									<option value={func.id} class="bg-gray-100 dark:bg-gray-800">{func.name}</option>
								{/each}
							{/if}
						</select>
					</div>
				</div>
			</div>

			{#if selectedId}
				<hr class="dark:border-gray-800 my-1 w-full" />

				<div class="my-2 text-xs">
					{#if !loading}
						<Valves
							{valvesSpec}
							bind:valves
							onChange={() => {
								debounceSubmitHandler();
							}}
						/>
					{:else}
						<Spinner className="size-5" />
					{/if}
				</div>
			{/if}
		</div>
	</form>
{:else}
	<Spinner className="size-4" />
{/if}
