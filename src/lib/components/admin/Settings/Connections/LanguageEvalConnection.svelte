<script lang="ts">
	import { getContext } from 'svelte';
	import type { Writable } from 'svelte/store';
	import type { i18n as i18nType } from 'i18next';
	const i18n: Writable<i18nType> = getContext('i18n');

	import Tooltip from '$lib/components/common/Tooltip.svelte';


	interface Props {
		/* eslint-disable @typescript-eslint/no-explicit-any */
		onDelete?: any;
		onSubmit?: any;
		/* eslint-enable @typescript-eslint/no-explicit-any */
		url?: string;
		idx?: number;
	}

	// `idx` accepted (parent passes it for list-key/removal purposes) but not
	// read internally by this component.
	let {
		onDelete = () => {},
		onSubmit = () => {},
		url = $bindable('')
	}: Props = $props();
</script>

<div class="flex gap-1.5">
	<Tooltip
		className="w-full relative"
		content={$i18n.t(`WebUI will make requests to "{{url}}/health"`, { url })}
		placement="top-start"
	>
		<input
			class="w-full text-sm bg-transparent outline-hidden"
			placeholder={$i18n.t('Enter URL (e.g. http://self-language-eval:8096)')}
			bind:value={url}
			onchange={() => onSubmit()}
		/>
	</Tooltip>

	<div class="flex gap-1">
		<Tooltip content={$i18n.t('Delete')} className="self-start">
			<button
				class="self-center p-1 bg-transparent hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-850 rounded-lg transition text-red-500"
				onclick={onDelete}
				type="button"
				aria-label="Delete connection"
			>
				<span class="text-base leading-none">×</span>
			</button>
		</Tooltip>
	</div>
</div>
