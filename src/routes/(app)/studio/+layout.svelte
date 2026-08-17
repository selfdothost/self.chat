<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import { onMount, getContext } from 'svelte';
	import { WEBUI_NAME, showSidebar, user } from '$lib/stores';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	import MenuLines from '$lib/components/icons/MenuLines.svelte';
	import Spinner from '$lib/components/common/Spinner.svelte';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	const i18n: Writable<i18nType> = getContext('i18n');

	let loaded = $state(false);

	onMount(async () => {
		if ($user?.role !== 'admin') {
			if (page.url.pathname.includes('/models') && !$user?.permissions?.studio?.models) {
				goto(resolve('/(app)'));
			} else if (
				page.url.pathname.includes('/knowledge') &&
				!$user?.permissions?.studio?.knowledge
			) {
				goto(resolve('/(app)'));
			} else if (
				page.url.pathname.includes('/prompts') &&
				!$user?.permissions?.studio?.prompts
			) {
				goto(resolve('/(app)'));
			} else if (
				page.url.pathname.includes('/training') &&
				!$user?.permissions?.studio?.training
			) {
				goto(resolve('/(app)'));
			} else if (
				page.url.pathname.includes('/evaluations') &&
				!$user?.permissions?.studio?.evaluations
			) {
				goto(resolve('/(app)'));
			} else if (page.url.pathname.includes('/tools') && !$user?.permissions?.studio?.tools) {
				goto(resolve('/(app)'));
			} else if (
				page.url.pathname.includes('/voices') &&
				!$user?.permissions?.studio?.voices
			) {
				goto(resolve('/(app)'));
			} else if (
				// Guards BOTH tokenization routes -- the gallery at
				// /studio/tokenization and the session beneath it -- because the
				// check is a prefix match on the path, not an exact one. R4-AC1
				// requires both, and a session reached directly by URL must be
				// refused rather than merely unlinked (R4-AC3).
				page.url.pathname.includes('/tokenization') &&
				!$user?.permissions?.studio?.tokenization
			) {
				goto(resolve('/(app)'));
			}
		}

		loaded = true;
	});
</script>

<svelte:head>
	<title>
		{$i18n.t('Studio')} | {$WEBUI_NAME}
	</title>
</svelte:head>

{#if loaded}
	<div
		class=" relative flex flex-col w-full h-screen max-h-[100dvh] {$showSidebar
			? 'md:max-w-[calc(100%-260px)]'
			: ''}"
	>
		<div class="   px-2.5 pt-1 backdrop-blur-xl">
			<div class=" flex items-center gap-1">
				<div class="{$showSidebar ? 'md:hidden' : ''} self-center flex flex-none items-center">
					<button
						id="sidebar-toggle-button"
						class="cursor-pointer p-1.5 flex rounded-xl hover:bg-gray-100 dark:hover:bg-gray-850 transition"
						onclick={() => {
							showSidebar.set(!$showSidebar);
						}}
						aria-label="Toggle Sidebar"
					>
						<div class=" m-auto self-center">
							<MenuLines />
						</div>
					</button>
				</div>

				<div class="">
					<div
						class="flex gap-1 scrollbar-none overflow-x-auto w-fit text-center text-sm font-medium rounded-full bg-transparent py-1 touch-auto pointer-events-auto"
					>
						{#if $user?.role === 'admin' || $user?.permissions?.studio?.models}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/models'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/models')}>{$i18n.t('Models')}</a
							>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.knowledge}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/knowledge'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/knowledge')}
							>
								{$i18n.t('Knowledge')}
							</a>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.prompts}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/prompts'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/prompts')}>{$i18n.t('Prompts')}</a
							>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.training}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/training'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/training')}
							>
								{$i18n.t('Training')}
							</a>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.evaluations}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/evaluations'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/evaluations')}
							>
								{$i18n.t('Evaluations')}
							</a>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.tools}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes('/studio/tools')
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/tools')}
							>
								{$i18n.t('Tools')}
							</a>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.voices}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes('/studio/voices')
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/voices')}
							>
								{$i18n.t('Voices')}
							</a>
						{/if}

						{#if $user?.role === 'admin' || $user?.permissions?.studio?.tokenization}
							<a
								class="min-w-fit rounded-full p-1.5 {page.url.pathname.includes(
									'/studio/tokenization'
								)
									? ''
									: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'} transition"
								href={resolve('/(app)/studio/tokenization')}
							>
								{$i18n.t('Tokenization')}
							</a>
						{/if}
					</div>
				</div>

				<!-- <div class="flex items-center text-xl font-semibold">{$i18n.t('Studio')}</div> -->
			</div>
		</div>

		<div class="  pb-1 px-[18px] flex-1 max-h-full overflow-y-auto" id="studio-container">
			{@render children?.()}
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center w-full h-screen max-h-[100dvh]">
		<Spinner />
	</div>
{/if}
