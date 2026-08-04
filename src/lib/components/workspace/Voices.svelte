<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';

	import { toast } from 'svelte-sonner';
	import { onMount, getContext } from 'svelte';
	import { resolve } from '$app/paths';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { WEBUI_NAME, voices as _voices } from '$lib/stores';
	import { getVoices, getVoiceList, deleteVoiceById } from '$lib/apis/voices';

	import DeleteConfirmDialog from '../common/ConfirmDialog.svelte';
	import VoiceCard from './Voices/VoiceCard.svelte';
	import Search from '../icons/Search.svelte';
	import Plus from '../icons/Plus.svelte';
	import Spinner from '../common/Spinner.svelte';

	let loaded = $state(false);

	let voices = $state([]);
	let filteredVoices = $state([]);

	let searchValue = $state('');

	let selectedVoice = $state(null);
	let showDeleteConfirm = $state(false);

	$effect(() => {
		if (voices) {
			filteredVoices = voices.filter(
				(v) => searchValue === '' || (v?.name ?? '').toLowerCase().includes(searchValue.toLowerCase())
			);
		}
	});

	const deleteHandler = async (voice) => {
		const res = await deleteVoiceById(localStorage.token, voice.id).catch((e) => {
			toast.error(e);
			return null;
		});

		if (res) {
			toast.success($i18n.t('Voice deleted successfully.'));
			voices = await getVoiceList(localStorage.token);
			_voices.set(await getVoices(localStorage.token));
		}
	};

	onMount(async () => {
		voices = await getVoiceList(localStorage.token);
		loaded = true;
	});
</script>

<svelte:head>
	<title>
		{$i18n.t('Voices')} | {$WEBUI_NAME}
	</title>
</svelte:head>

{#if loaded}
	<DeleteConfirmDialog
		bind:show={showDeleteConfirm}
		onConfirm={() => {
			deleteHandler(selectedVoice);
		}}
	/>

	<div class="flex flex-col gap-1 my-1.5">
		<div class="flex justify-between items-center">
			<div class="flex items-center md:self-center text-xl font-medium px-0.5">
				{$i18n.t('Voices')}
				<div class="flex self-center w-[1px] h-6 mx-2.5 bg-gray-50 dark:bg-gray-850"></div>
				<span class="text-lg font-medium text-gray-500 dark:text-gray-300"
					>{filteredVoices.length}</span
				>
			</div>
		</div>

		<div class=" flex flex-1 items-center w-full space-x-2">
			<div class="flex flex-1 items-center">
				<div class=" self-center ml-1 mr-3">
					<Search className="size-3.5" />
				</div>
				<input
					class=" w-full text-sm py-1 rounded-r-xl outline-none bg-transparent"
					bind:value={searchValue}
					placeholder={$i18n.t('Search Voices')}
				/>
			</div>

			<div>
				<a
					class=" px-2 py-2 rounded-xl hover:bg-gray-700/10 dark:hover:bg-gray-100/10 dark:text-gray-300 dark:hover:text-white transition font-medium text-sm flex items-center space-x-1"
					href={resolve('/(app)/workspace/voices/create')}
					aria-label={$i18n.t('Create Voice')}
				>
					<Plus className="size-3.5" />
				</a>
			</div>
		</div>
	</div>

	{#if filteredVoices.length > 0}
		<div class=" my-2 mb-5 gap-2 grid lg:grid-cols-2 xl:grid-cols-3" id="voice-list">
			{#each filteredVoices as voice (voice.id)}
				<VoiceCard
					{voice}
					deleteHandler={() => {
						selectedVoice = voice;
						showDeleteConfirm = true;
					}}
				/>
			{/each}
		</div>
	{:else}
		<div class="w-full flex flex-col items-center justify-center text-center my-16 gap-3">
			<div class="text-gray-400 dark:text-gray-500">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-10"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z"
					/>
				</svg>
			</div>
			<div class="text-sm text-gray-500 dark:text-gray-400">
				{#if searchValue}
					{$i18n.t('No voices found.')}
				{:else}
					{$i18n.t('You don’t have any voices yet.')}
				{/if}
			</div>
			<a
				class="text-sm px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-gray-200 transition font-medium flex items-center gap-1"
				href={resolve('/(app)/workspace/voices/create')}
			>
				<Plus className="size-3.5" />
				{$i18n.t('Create your first voice')}
			</a>
		</div>
	{/if}
{:else}
	<div class="w-full h-full flex justify-center items-center">
		<Spinner />
	</div>
{/if}
