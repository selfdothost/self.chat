<script lang="ts">
	import FolderMenu from './FolderMenu.svelte';
	export let onEvent: (name: string) => void = () => {};
</script>

<FolderMenu
	on:newChat={() => onEvent('newChat')}
	on:configure={() => onEvent('configure')}
	on:rename={() => onEvent('rename')}
	on:export={() => onEvent('export')}
	on:delete={() => onEvent('delete')}
	on:close={() => onEvent('close')}
>
	<span data-testid="folder-menu-trigger">menu</span>
</FolderMenu>
