<script lang="ts">
	import FolderMenu from './FolderMenu.svelte';
	interface Props {
		onEvent?: (name: string) => void;
	}

	let { onEvent = () => {} }: Props = $props();
</script>

<FolderMenu
	onNewChat={() => onEvent('newChat')}
	onConfigure={() => onEvent('configure')}
	onRename={() => onEvent('rename')}
	onExport={() => onEvent('export')}
	onDelete={() => onEvent('delete')}
>
	<span data-testid="folder-menu-trigger">menu</span>
</FolderMenu>
