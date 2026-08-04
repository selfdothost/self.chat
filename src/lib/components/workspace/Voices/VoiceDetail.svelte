<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { DropdownMenu } from 'bits-ui';
	import { toast } from 'svelte-sonner';

	import { onMount, getContext } from 'svelte';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { voices as _voices } from '$lib/stores';

	import {
		getVoiceById,
		getVoices,
		updateVoiceById,
		updateVoiceGraphById,
		deleteVoiceById
	} from '$lib/apis/voices';

	import Spinner from '$lib/components/common/Spinner.svelte';
	import LockClosed from '$lib/components/icons/LockClosed.svelte';
	import EllipsisHorizontal from '$lib/components/icons/EllipsisHorizontal.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';
	import AccessControlModal from '../common/AccessControlModal.svelte';
	import DeleteConfirmDialog from '../../common/ConfirmDialog.svelte';
	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	import VoiceFiles from './VoiceFiles.svelte';
	import SoundPipelineCanvas from './SoundPipelineCanvas.svelte';

	type Voice = {
		id: string;
		name: string;
		description: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		graph?: { nodes: any[]; edges: any[] } | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		access_control?: Record<string, any> | null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		files: Record<string, any>[];
	};

	let id = $state('');
	let voice: Voice | null = $state(null);

	let activeTab: 'files' | 'pipeline' = $state('files');

	let showAccessControlModal = $state(false);
	let showMenu = $state(false);
	let showDeleteConfirm = $state(false);

	let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

	const changeDebounceHandler = () => {
		if (debounceTimeout) {
			clearTimeout(debounceTimeout);
		}

		debounceTimeout = setTimeout(async () => {
			if (!voice) return;
			if (voice.name.trim() === '') {
				toast.error($i18n.t('Please fill in all fields.'));
				return;
			}

			const res = await updateVoiceById(localStorage.token, id, {
				name: voice.name,
				description: voice.description,
				access_control: voice.access_control
			}).catch((e) => {
				toast.error(e);
				return null;
			});

			if (res) {
				toast.success($i18n.t('Voice updated successfully'));
				_voices.set(await getVoices(localStorage.token));
			}
		}, 1000);
	};

	// T-013 — persist the pipeline graph. The canvas emits {nodes, edges} on
	// change; debounce, keep local voice.graph in sync (so a tab remount reloads
	// the latest), and PATCH via the dedicated graph endpoint (a real structured
	// field, not a file-blob hack).
	let graphDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const graphChangeHandler = (graph: { nodes: any[]; edges: any[] }) => {
		if (!voice || !id) return;
		voice.graph = graph;
		if (graphDebounceTimeout) {
			clearTimeout(graphDebounceTimeout);
		}
		graphDebounceTimeout = setTimeout(async () => {
			await updateVoiceGraphById(localStorage.token, id, graph).catch((e) => {
				toast.error(e);
			});
		}, 1000);
	};

	const deleteHandler = async () => {
		if (!id) return;
		const res = await deleteVoiceById(localStorage.token, id).catch((e) => {
			toast.error(e);
			return null;
		});

		if (res) {
			toast.success($i18n.t('Voice deleted successfully.'));
			_voices.set(await getVoices(localStorage.token));
			goto(resolve('/(app)/workspace/voices'));
		}
	};

	onMount(async () => {
		id = page.params.id;

		const res = await getVoiceById(localStorage.token, id).catch((e) => {
			toast.error(e);
			return null;
		});

		if (res) {
			voice = res;
		} else {
			goto(resolve('/(app)/workspace/voices'));
		}
	});
</script>

<div class="flex flex-col w-full translate-y-1" id="voice-container">
	{#if id && voice}
		<AccessControlModal
			bind:show={showAccessControlModal}
			bind:accessControl={voice.access_control}
			onChange={() => {
				changeDebounceHandler();
			}}
		/>

		<DeleteConfirmDialog
			bind:show={showDeleteConfirm}
			onConfirm={() => {
				deleteHandler();
			}}
		/>

		<div class="w-full mb-2.5">
			<div class=" flex w-full">
				<div class="flex-1">
					<div class="flex items-center justify-between w-full px-0.5 mb-1">
						<div class="w-full">
							<input
								type="text"
								class="text-left w-full font-semibold text-2xl font-primary bg-transparent outline-none"
								bind:value={voice.name}
								placeholder={$i18n.t('Voice Name')}
								oninput={() => {
									changeDebounceHandler();
								}}
							/>
						</div>

						<div class="self-center flex-shrink-0 flex items-center gap-1">
							<button
								class="bg-gray-50 hover:bg-gray-100 text-black dark:bg-gray-850 dark:hover:bg-gray-800 dark:text-white transition px-2 py-1 rounded-full flex gap-1 items-center"
								type="button"
								onclick={() => {
									showAccessControlModal = true;
								}}
							>
								<LockClosed strokeWidth="2.5" className="size-3.5" />
								<div class="text-sm font-medium flex-shrink-0">
									{$i18n.t('Access')}
								</div>
							</button>

							<Dropdown bind:show={showMenu} align="end">
								<Tooltip content={$i18n.t('More')}>
									<button
										class="self-center w-fit text-sm p-1.5 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
										type="button"
										onclick={() => {
											showMenu = true;
										}}
									>
										<EllipsisHorizontal className="size-5" />
									</button>
								</Tooltip>

								{#snippet content()}
																<div >
										<DropdownMenuContent
											class="w-full max-w-[160px] rounded-xl px-1 py-1.5 border border-gray-300/30 dark:border-gray-700/50 z-50 bg-white dark:bg-gray-850 dark:text-white shadow"
											sideOffset={-2}
											side="bottom"
											align="end"
										>
											<DropdownMenu.Item
												class="flex gap-2 items-center px-3 py-2 text-sm font-medium cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md"
												onSelect={() => {
													showDeleteConfirm = true;
												}}
											>
												<GarbageBin strokeWidth="2" />
												<div class="flex items-center">{$i18n.t('Delete')}</div>
											</DropdownMenu.Item>
										</DropdownMenuContent>
									</div>
															{/snippet}
							</Dropdown>
						</div>
					</div>

					<div class="flex w-full px-1">
						<input
							type="text"
							class="text-left text-xs w-full text-gray-500 bg-transparent outline-none"
							bind:value={voice.description}
							placeholder={$i18n.t('Voice Description')}
							oninput={() => {
								changeDebounceHandler();
							}}
						/>
					</div>
				</div>
			</div>

			<div class="flex items-center gap-1 px-1 mt-1 relative">
				<button
					class="px-3 py-1 text-sm font-medium rounded-lg transition {activeTab === 'files'
						? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
						: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850'}"
					onclick={() => {
						activeTab = 'files';
					}}
				>
					{$i18n.t('Files')}
				</button>
				<button
					class="px-3 py-1 text-sm font-medium rounded-lg transition {activeTab === 'pipeline'
						? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
						: 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-850'}"
					onclick={() => {
						activeTab = 'pipeline';
					}}
				>
					{$i18n.t('Workshop')}
				</button>
			</div>
		</div>

		{#if activeTab === 'files'}
			<div class="flex flex-col flex-1 h-full max-h-full pb-2.5 gap-2">
				<VoiceFiles
					voiceId={id}
					bind:files={voice.files}
					onChange={(updatedVoice) => {
						voice = updatedVoice;
					}}
				/>
			</div>
		{:else if activeTab === 'pipeline'}
			<div style="height: calc(100vh - 270px);">
				{#key id}
					<SoundPipelineCanvas
							graph={voice.graph ?? null}
							onGraphChange={graphChangeHandler}
							voiceId={voice.id}
							samples={(voice.files ?? []).map((f) => ({
								id: f.id,
								name: f.meta?.name ?? f.filename ?? f.id
							}))}
						/>
				{/key}
			</div>
		{/if}
	{:else}
		<Spinner />
	{/if}
</div>
