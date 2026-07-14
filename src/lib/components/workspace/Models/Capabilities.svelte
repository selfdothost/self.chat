<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { getContext } from 'svelte';
	import Checkbox from '$lib/components/common/Checkbox.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';
	import { marked } from 'marked';

	const i18n: Writable<i18nType> = getContext('i18n');

	// i18next's `t()` type is a union that includes Promise<string> for
	// async-loaded namespaces; this app always initializes i18next
	// synchronously, so these resolve to plain strings at call time --
	// cast here since they're fed into marked.parse(), which requires
	// a `string` argument.
	const helpText: Record<string, string> = {
		vision: $i18n.t('Model accepts image inputs') as string,
		usage: $i18n.t(
			'Sends `stream_options: { include_usage: true }` in the request.\nSupported providers will return token usage information in the response when set.'
		) as string,
		citations: $i18n.t('Displays citations in the response') as string
	};

	export let capabilities: {
		vision?: boolean;
		usage?: boolean;
		citations?: boolean;
	} = {};
</script>

<div>
	<div class="flex w-full justify-between mb-1">
		<div class=" self-center text-sm font-semibold">{$i18n.t('Capabilities')}</div>
	</div>
	<div class="flex">
		{#each Object.keys(capabilities) as capability (capability)}
			<div class=" flex items-center gap-2 mr-3">
				<Checkbox
					state={capabilities[capability] ? 'checked' : 'unchecked'}
					on:change={(e) => {
						capabilities[capability] = e.detail === 'checked';
					}}
				/>

				<div class=" py-0.5 text-sm capitalize">
					<Tooltip content={marked.parse(helpText[capability], { async: false })}>
						{$i18n.t(capability)}
					</Tooltip>
				</div>
			</div>
		{/each}
	</div>
</div>
