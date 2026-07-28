<script lang="ts">
	import Folder from './Folder.svelte';
	export let onChange: (open: boolean) => void = () => {};
</script>

<!-- The folder tree lives in Folder's default slot -> the collapsible content,
     which is only rendered while open. Mirrors the Sidebar's Folders section. -->
<Folder collapsible name="Folders" on:change={(e) => onChange(e.detail)}>
	<div data-testid="folder-tree">TREE</div>
</Folder>
