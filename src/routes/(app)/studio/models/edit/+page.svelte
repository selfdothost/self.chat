<script>
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import { onMount, getContext } from 'svelte';
	/** @type {import('svelte/store').Writable<import('i18next').i18n>} */
	const i18n = getContext('i18n');

	import { page } from '$app/state';
	import { models } from '$lib/stores';

	import { getModelById, updateModelById } from '$lib/apis/models';

	import { getModels } from '$lib/apis';
	import ModelEditor from '$lib/components/studio/Models/ModelEditor.svelte';

	let model = $state(null);

	onMount(async () => {
		const _id = page.url.searchParams.get('id');
		if (_id) {
			model = await getModelById(localStorage.token, _id).catch((_e) => {
				return null;
			});

			if (!model) {
				goto(resolve('/(app)/studio/models'));
			}
		} else {
			goto(resolve('/(app)/studio/models'));
		}
	});

	const onSubmit = async (modelInfo) => {
		const res = await updateModelById(localStorage.token, modelInfo.id, modelInfo);

		if (res) {
			await models.set(await getModels(localStorage.token));
			toast.success($i18n.t('Model updated successfully'));
			await goto(resolve('/(app)/studio/models'));
		}
	};
</script>

{#if model}
	<ModelEditor edit={true} {model} {onSubmit} />
{/if}
