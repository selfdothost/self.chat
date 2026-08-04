<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { prompts } from '$lib/stores';
	import { onMount, getContext } from 'svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	import { getPromptByCommand, getPrompts, updatePromptByCommand } from '$lib/apis/prompts';
	import { page } from '$app/state';

	import PromptEditor from '$lib/components/workspace/Prompts/PromptEditor.svelte';

	let prompt = $state(null);
	const onSubmit = async (_prompt) => {
		console.log(_prompt);
		const prompt = await updatePromptByCommand(localStorage.token, _prompt).catch((error) => {
			toast.error(error);
			return null;
		});

		if (prompt) {
			toast.success($i18n.t('Prompt updated successfully'));
			await prompts.set(await getPrompts(localStorage.token));
			await goto(resolve('/(app)/workspace/prompts'));
		}
	};

	onMount(async () => {
		const command = page.url.searchParams.get('command');
		if (command) {
			const _prompt = await getPromptByCommand(
				localStorage.token,
				command.replace(/\//g, '')
			).catch((error) => {
				toast.error(error);
				return null;
			});

			if (_prompt) {
				prompt = {
					title: _prompt.title,
					command: _prompt.command,
					content: _prompt.content,
					access_control: _prompt?.access_control ?? null
				};
			} else {
				goto(resolve('/(app)/workspace/prompts'));
			}
		} else {
			goto(resolve('/(app)/workspace/prompts'));
		}
	});
</script>

{#if prompt}
	<PromptEditor {prompt} {onSubmit} edit />
{/if}
