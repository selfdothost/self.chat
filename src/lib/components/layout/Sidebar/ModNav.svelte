<script lang="ts">
	import { resolve } from '$app/paths';
	import { enabledMods, showSidebar, mobile } from '$lib/stores';

	// Registry-driven nav (client R1). Renders one entry per mod the registry
	// reported with `add_to_nav` true, using that entry's label + icon. The list
	// is exactly the server response (already scope-filtered): a mod the response
	// omits produces no entry, and this component applies NO permission/role
	// gating of its own — the only filter is `add_to_nav`.
	let navMods = $derived($enabledMods.filter((mod) => mod.add_to_nav === true));

	// An icon string is rendered as an image when it points at a URL/asset path,
	// otherwise as a short text/emoji glyph. Never interpolated as HTML.
	const isImageIcon = (icon?: string) =>
		!!icon && (icon.startsWith('http://') || icon.startsWith('https://') || icon.startsWith('/'));

	const onSelect = () => {
		if ($mobile) {
			showSidebar.set(false);
		}
	};
</script>

<!-- Additive to the core hardcoded nav in Sidebar.svelte — this block does not
     touch or restyle any built-in item; it appends the mod entries beneath them. -->
{#each navMods as mod (mod.id)}
	<div class="px-1.5 flex justify-center text-gray-800 dark:text-gray-200">
		<a
			class="flex-grow flex space-x-3 rounded-lg px-2 py-[7px] hover:bg-gray-100 dark:hover:bg-gray-900 transition"
			href={resolve('/(app)/mods/[id]', { id: mod.id })}
			data-mod-id={mod.id}
			onclick={onSelect}
			draggable="false"
		>
			<div class="self-center flex items-center justify-center size-[1.1rem]">
				{#if isImageIcon(mod.icon)}
					<img src={mod.icon} alt="" class="size-[1.1rem] rounded-sm" crossorigin="anonymous" />
				{:else if mod.icon}
					<span class="text-base leading-none" aria-hidden="true">{mod.icon}</span>
				{/if}
			</div>

			<div class="flex self-center">
				<div class="self-center font-medium text-sm font-primary">
					{mod.label ?? mod.name}
				</div>
			</div>
		</a>
	</div>
{/each}
