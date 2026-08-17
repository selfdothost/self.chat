<script lang="ts">
	import Tooltip from '../Tooltip.svelte';
	import XMark from '$lib/components/icons/XMark.svelte';

	interface Props {
		tags?: { name: string }[];
		// Emits the tag NAME, not the tag object -- the previous `delete` event
		// carried `tag.name` and every consumer treats the payload as a string.
		onDelete?: (name: string) => void;
	}

	let { tags = [], onDelete = () => {} }: Props = $props();
</script>

{#each tags as tag (tag.name)}
	<Tooltip content={tag.name}>
		<div
			class="relative group/tags px-1.5 py-[0.2px] gap-0.5 flex justify-between h-fit max-h-fit w-fit items-center rounded-full bg-gray-500/20 text-gray-700 dark:text-gray-200 transition cursor-pointer"
		>
			<div class=" text-[0.7rem] font-medium self-center line-clamp-1 w-fit">
				{tag.name}
			</div>
			<div class="absolute invisible right-0.5 group-hover/tags:visible transition">
				<button
					class="rounded-full border bg-white dark:bg-gray-700 h-full flex self-center cursor-pointer"
					onclick={() => {
						onDelete(tag.name);
					}}
					type="button"
				>
					<XMark className="size-3" strokeWidth="2.5" />
				</button>
			</div>
		</div>
	</Tooltip>
{/each}
