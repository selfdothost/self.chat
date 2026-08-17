<script>
	import { preventDefault } from 'svelte/legacy';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { getContext } from 'svelte';
	/** @type {import('svelte/store').Writable<import('i18next').i18n>} */
	const i18n = getContext('i18n');

	import { createNewKnowledge, getKnowledgeBases, getHfDatasetInfo } from '$lib/apis/knowledge';
	import { toast } from 'svelte-sonner';
	import { knowledge } from '$lib/stores';
	import AccessControl from '../common/AccessControl.svelte';

	let loading = $state(false);

	let name = $state('');
	let description = $state('');
	let hfPath = $state('');
	let accessControl = $state(null);

	// HuggingFace auto-fill state
	let fetchingInfo = $state(false);
	let detectedFormat = $state('');
	let infoError = $state('');

	const FORMAT_LABELS = {
		alpaca: 'Alpaca (instruction / output)',
		chat_template: 'Chat (role / content)',
		sharegpt: 'ShareGPT (from / value)',
		completion: 'Completion (text)'
	};

	// Pull name + description + detected training format from HuggingFace when the
	// dataset path is entered. Only fills fields the user hasn't already typed.
	const fetchHfInfo = async () => {
		const path = hfPath.trim();
		if (path === '') return;
		fetchingInfo = true;
		infoError = '';
		detectedFormat = '';
		try {
			const info = await getHfDatasetInfo(localStorage.token, path);
			if (info) {
				if (name.trim() === '' && info.name) name = info.name;
				if (description.trim() === '' && info.description) description = info.description;
				detectedFormat = info?.format?.type ?? '';
			}
		} catch (e) {
			infoError =
				typeof e === 'string' ? e : $i18n.t('Could not fetch dataset info from HuggingFace.');
		}
		fetchingInfo = false;
	};

	const submitHandler = async () => {
		loading = true;

		if (hfPath.trim() === '') {
			toast.error($i18n.t('Please enter a HuggingFace dataset path.'));
			loading = false;
			return;
		}

		// If Name or Description are blank, pull them from HuggingFace and save —
		// don't make the user type what HF already provides.
		if (name.trim() === '' || description.trim() === '') {
			await fetchHfInfo();
		}
		// Last-resort name fallback: the dataset path's final segment.
		if (name.trim() === '') {
			name = hfPath.trim().split('/').pop() ?? hfPath.trim();
		}

		const res = await createNewKnowledge(
			localStorage.token,
			name,
			description,
			accessControl,
			{ dataset: true, hf_path: hfPath.trim() },
			{ hf_path: hfPath.trim() }
		).catch((e) => {
			toast.error(e);
		});

		if (res) {
			toast.success($i18n.t('Dataset added successfully.'));
			knowledge.set(await getKnowledgeBases(localStorage.token));
			goto(resolve('/(app)/studio/knowledge'));
		}

		loading = false;
	};
</script>

<div class="w-full max-h-full">
	<button
		class="flex space-x-1"
		onclick={() => {
			goto(resolve('/(app)/studio/knowledge'));
		}}
	>
		<div class=" self-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 20 20"
				fill="currentColor"
				class="w-4 h-4"
			>
				<path
					fill-rule="evenodd"
					d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
					clip-rule="evenodd"
				/>
			</svg>
		</div>
		<div class=" self-center font-medium text-sm">{$i18n.t('Back')}</div>
	</button>

	<form
		class="flex flex-col max-w-lg mx-auto mt-10 mb-10"
		onsubmit={preventDefault(() => {
			submitHandler();
		})}
	>
		<div class=" w-full flex flex-col justify-center">
			<div class=" text-2xl font-medium font-primary mb-2.5">
				{$i18n.t('Add a Dataset')}
			</div>

			<div class="w-full flex flex-col gap-2.5">
				<div class="w-full">
					<div class=" text-sm mb-2">{$i18n.t('Name')}</div>

					<div class="w-full mt-1">
						<input
							class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
							type="text"
							bind:value={name}
							placeholder={$i18n.t('Auto-filled from HuggingFace if left blank')}
						/>
					</div>
				</div>

				<div>
					<div class="text-sm mb-2">{$i18n.t('Description')}</div>

					<div class=" w-full mt-1">
						<textarea
							class="w-full resize-none rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden"
							rows="3"
							bind:value={description}
							placeholder={$i18n.t('Auto-filled from HuggingFace if left blank')}
						></textarea>
					</div>
				</div>

				<div>
					<div class="text-sm mb-2">{$i18n.t('HuggingFace Dataset Path')}</div>

					<div class=" w-full mt-1">
						<input
							class="w-full rounded-lg py-2 px-4 text-sm bg-gray-50 dark:text-gray-300 dark:bg-gray-850 outline-hidden font-mono"
							type="text"
							bind:value={hfPath}
							onblur={fetchHfInfo}
							placeholder={$i18n.t('e.g. tatsu-lab/alpaca')}
							required
						/>
					</div>
					<div class="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
						{#if fetchingInfo}
							<svg class="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="currentColor"
								><path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25" /><path
									d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
								/></svg
							>
							{$i18n.t('Fetching dataset info from HuggingFace…')}
						{:else if infoError}
							<span class="text-amber-600 dark:text-amber-400">{infoError}</span>
						{:else if detectedFormat}
							{$i18n.t('Name and description auto-filled from HuggingFace.')}
							<span class="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
								{FORMAT_LABELS[detectedFormat] ?? detectedFormat}
							</span>
						{:else}
							{$i18n.t('Enter the HuggingFace dataset identifier (org/dataset-name).')}
						{/if}
					</div>
				</div>
			</div>
		</div>

		<div class="mt-2">
			<div class="px-3 py-2 bg-gray-50 dark:bg-gray-950 rounded-lg">
				<AccessControl bind:accessControl />
			</div>
		</div>

		<div class="flex justify-end mt-2">
			<div>
				<button
					class=" text-sm px-4 py-2 transition rounded-lg {loading
						? ' cursor-not-allowed bg-gray-100 dark:bg-gray-800'
						: ' bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800'} flex"
					type="submit"
					disabled={loading}
				>
					<div class=" self-center font-medium">{$i18n.t('Add Dataset')}</div>

					{#if loading}
						<div class="ml-1.5 self-center">
							<svg
								class=" w-4 h-4"
								viewBox="0 0 24 24"
								fill="currentColor"
								xmlns="http://www.w3.org/2000/svg"
								><style>
									.spinner_ajPY {
										transform-origin: center;
										animation: spinner_AtaB 0.75s infinite linear;
									}
									@keyframes spinner_AtaB {
										100% {
											transform: rotate(360deg);
										}
									}
								</style><path
									d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
									opacity=".25"
								/><path
									d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
									class="spinner_ajPY"
								/></svg
							>
						</div>
					{/if}
				</button>
			</div>
		</div>
	</form>
</div>
