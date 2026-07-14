<script lang="ts">
	import { Handle, Position, type Node, type NodeProps } from '@xyflow/svelte';
	import type { Model } from '$lib/stores';

	import ProfileImage from '../Messages/ProfileImage.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import Heart from '$lib/components/icons/Heart.svelte';

	// Shape of the flow node `data` prop built in Overview.svelte's drawFlow()
	// (`{ user: $user, message: history.messages[id], model: ... }`). Only the
	// fields this component actually reads/writes are listed.
	type OverviewNodeData = {
		user?: {
			profile_image_url?: string;
			name?: string;
		};
		message: {
			id: string;
			role: string;
			content: string;
			model?: string;
			error?: boolean | { content: string };
			favorite?: boolean | null;
		};
		model?: Model;
	};

	type $$Props = NodeProps<Node<OverviewNodeData>>;
	export let data: $$Props['data'];
</script>

<div
	class="px-4 py-3 shadow-md rounded-xl dark:bg-black bg-white border dark:border-gray-900 w-60 h-20 group"
>
	<Tooltip
		content={typeof data?.message?.error === 'object'
			? data.message.error.content
			: data.message.content}
		className="w-full"
		allowHTML={false}
	>
		{#if data.message.role === 'user'}
			<div class="flex w-full">
				<ProfileImage
					src={data.user?.profile_image_url ?? '/user.png'}
					className="size-5 -translate-y-[1px]"
				/>
				<div class="ml-2">
					<div class=" flex justify-between items-center">
						<div class="text-xs text-black dark:text-white font-medium line-clamp-1">
							{data?.user?.name ?? 'User'}
						</div>
					</div>

					{#if data?.message?.error}
						<div class="text-red-500 line-clamp-2 text-xs mt-0.5">
							{typeof data.message.error === 'object' ? data.message.error.content : data.message.content}
						</div>
					{:else}
						<div class="text-gray-500 line-clamp-2 text-xs mt-0.5">{data.message.content}</div>
					{/if}
				</div>
			</div>
		{:else}
			<div class="flex w-full">
				<ProfileImage
					src={data?.model?.info?.meta?.profile_image_url ?? ''}
					className="size-5 -translate-y-[1px]"
				/>

				<div class="ml-2">
					<div class=" flex justify-between items-center">
						<div class="text-xs text-black dark:text-white font-medium line-clamp-1">
							{data?.model?.name ?? data?.message?.model ?? 'Assistant'}
						</div>

						<button
							class={data?.message?.favorite ? '' : 'invisible group-hover:visible'}
							on:click={() => {
								data.message.favorite = !(data?.message?.favorite ?? false);
							}}
						>
							<Heart
								className="size-3 {data?.message?.favorite
									? 'fill-red-500 stroke-red-500'
									: 'hover:fill-red-500 hover:stroke-red-500'} "
								strokeWidth="2.5"
							/>
						</button>
					</div>

					{#if data?.message?.error}
						<div class="text-red-500 line-clamp-2 text-xs mt-0.5">
							{typeof data.message.error === 'object' ? data.message.error.content : data.message.content}
						</div>
					{:else}
						<div class="text-gray-500 line-clamp-2 text-xs mt-0.5">{data.message.content}</div>
					{/if}
				</div>
			</div>
		{/if}
	</Tooltip>
	<Handle type="target" position={Position.Top} class="w-2 rounded-full dark:bg-gray-900" />
	<Handle type="source" position={Position.Bottom} class="w-2 rounded-full dark:bg-gray-900" />
</div>
