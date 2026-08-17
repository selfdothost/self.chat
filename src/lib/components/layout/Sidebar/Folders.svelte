<script lang="ts">

	import RecursiveFolder from './RecursiveFolder.svelte';
	/**
	 * Pure forwarder for the folder tree: onImport/onUpdate/onChange carry
	 * RecursiveFolder's payloads up to the Sidebar unchanged.
	 *
	 * @typedef {Object} Props
	 * @property {any} [folders]
	 * @property {any} [onImport]
	 * @property {any} [onUpdate]
	 * @property {any} [onChange]
	 */

	/** @type {Props} */
	let { folders = {}, onImport = () => {}, onUpdate = () => {}, onChange = () => {} } = $props();

	let folderList = $derived(Object.keys(folders)
		.filter((key) => folders[key].parent_id === null)
		.sort((a, b) =>
			folders[a].name.localeCompare(folders[b].name, undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		));
	// Get the list of folders that have no parent, sorted by name alphabetically
	
</script>

{#each folderList as folderId (folderId)}
	<RecursiveFolder
		className=""
		{folders}
		{folderId}
		{onImport}
		{onUpdate}
		{onChange}
	/>
{/each}
