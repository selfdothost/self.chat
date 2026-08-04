<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { DropdownMenu } from 'bits-ui';

	import dayjs from 'dayjs';
	import relativeTime from 'dayjs/plugin/relativeTime';
	dayjs.extend(relativeTime);

	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	const i18n: Writable<i18nType> = getContext('i18n');

	import { capitalizeFirstLetter } from '$lib/utils';

	import Dropdown from '$lib/components/common/Dropdown.svelte';
	import DropdownMenuContent from '$lib/components/common/DropdownMenuContent.svelte';
	import Badge from '$lib/components/common/Badge.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import EllipsisHorizontal from '$lib/components/icons/EllipsisHorizontal.svelte';
	import GarbageBin from '$lib/components/icons/GarbageBin.svelte';


	interface Props {
		voice: {
		id: string;
		name: string;
		description?: string;
		access_control?: Record<string, unknown> | null;
		updated_at?: number;
		user?: { name?: string; email?: string };
	};
		deleteHandler?: AnyFn;
	}

	let { voice, deleteHandler = () => {} }: Props = $props();

	let showMenu = $state(false);

	// access_control === null -> public; anything else -> restricted, same model as Knowledge.
	let isPublic = $derived((voice?.access_control ?? null) === null);
</script>

<button
	class=" flex space-x-4 cursor-pointer text-left w-full px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-850 transition rounded-xl"
	id="voice-item-{voice.id}"
	onclick={() => {
		goto(resolve('/(app)/workspace/voices/[id]', { id: voice.id }));
	}}
>
	<div class=" w-full">
		<div class="flex items-center justify-between -mt-1">
			{#if isPublic}
				<Badge type="success" content={$i18n.t('Public')} />
			{:else}
				<Badge type="muted" content={$i18n.t('Private')} />
			{/if}

			<div class=" flex self-center -mr-1 translate-y-1">
				<Dropdown
					bind:show={showMenu}
					align="end"
				>
					<Tooltip content={$i18n.t('More')}>
						<button
							class="self-center w-fit text-sm p-1.5 dark:text-gray-300 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 rounded-xl"
							type="button"
							onclick={(e) => {
								e.stopPropagation();
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
										deleteHandler();
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

		<div class=" self-center flex-1 px-1 mb-1">
			<div class=" font-semibold line-clamp-1 h-fit">{voice.name}</div>

			<div class=" text-xs overflow-hidden text-ellipsis line-clamp-1">
				{voice.description ?? ''}
			</div>

			<div class="mt-3 flex justify-between">
				<div class="text-xs text-gray-500">
					<Tooltip
						content={voice?.user?.email ?? $i18n.t('Deleted User')}
						className="flex shrink-0"
						placement="top-start"
					>
						{$i18n.t('By {{name}}', {
							name: capitalizeFirstLetter(
								voice?.user?.name ?? voice?.user?.email ?? $i18n.t('Deleted User')
							)
						})}
					</Tooltip>
				</div>
				{#if voice?.updated_at}
					<div class=" text-xs text-gray-500 line-clamp-1">
						{$i18n.t('Updated')}
						{dayjs(voice.updated_at * 1000).fromNow()}
					</div>
				{/if}
			</div>
		</div>
	</div>
</button>
