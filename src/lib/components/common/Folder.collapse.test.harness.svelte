<script lang="ts">
	import Folder from './Folder.svelte';
	interface Props {
		onChange?: (open: boolean) => void;
	}

	let { onChange = () => {} }: Props = $props();
</script>

<!-- The folder tree lives in Folder's default slot -> the collapsible content,
     which is only rendered while open. Mirrors the Sidebar's Folders section. -->
<Folder collapsible name="Folders" onChange={(detail) => onChange(detail)}>
	<div data-testid="folder-tree">TREE</div>
</Folder>
