<script lang="ts">
	import type { i18n as i18nType } from 'i18next';
	import type { Writable } from 'svelte/store';
	import type { AnyFn } from '$lib/types';
	import { getContext } from 'svelte';
	import type { AudioConnection, AudioConnectionType } from '$lib/apis/audio';

	import Modal from '$lib/components/common/Modal.svelte';
	import SensitiveInput from '$lib/components/common/SensitiveInput.svelte';

	const i18n: Writable<i18nType> = getContext('i18n');

	export let show = false;
	export let edit = false;

	/** The five selectable kinds, each carrying the fields IT presents. */
	export let types: AudioConnectionType[] = [];
	/** Existing connection when editing; null when adding. */
	export let connection: AudioConnection | null = null;

	export let onSubmit: AnyFn = () => {};
	export let onDelete: AnyFn = () => {};

	// R1: nothing type-specific is editable until a type has been chosen, so this
	// starts null on an add and the field form simply isn't rendered yet.
	let selectedType: string | null = null;
	let fieldValues: Record<string, string> = {};

	$: chosen = types.find((t) => t.type === selectedType) ?? null;

	let seededFor: string | null = null;
	const seed = () => {
		const key = `${edit}:${connection?.id ?? 'new'}`;
		if (seededFor === key) return;
		seededFor = key;

		if (edit && connection) {
			selectedType = connection.type;
			fieldValues = { ...(connection.fields ?? {}) };
			// Secret values come back masked from the server — never round-trip the
			// mask, or saving an untouched form would overwrite the real credential
			// with asterisks. Blank them and treat blank as "leave unchanged".
			for (const f of types.find((t) => t.type === connection?.type)?.fields ?? []) {
				if (f.secret) fieldValues[f.name] = '';
			}
		} else {
			selectedType = null;
			fieldValues = {};
		}
	};

	// Re-seed whenever the modal opens so a reopened dialog never shows stale state.
	// Declared after `seed` so the reactive statement references an initialized
	// binding (eslint no-useless-assignment).
	$: if (show) {
		seed();
	}

	// R3: choosing (or re-choosing) a type re-scopes the form to that type's
	// fields, so a draft can never carry a field belonging to another type.
	const chooseType = (type: string) => {
		selectedType = type;
		fieldValues = {};
	};

	const submitHandler = () => {
		if (!selectedType) return;

		const secretNames = new Set(
			(chosen?.fields ?? []).filter((f) => f.secret).map((f) => f.name)
		);

		const payload: Record<string, string> = {};
		for (const f of chosen?.fields ?? []) {
			const v = (fieldValues[f.name] ?? '').trim();
			// Omit blank secrets on edit so the stored credential is preserved
			// (the API merges the supplied fields rather than replacing the set).
			if (!v && edit && secretNames.has(f.name)) continue;
			if (v) payload[f.name] = v;
		}

		onSubmit({ type: selectedType, fields: payload });
		show = false;
		seededFor = null;
	};
</script>

<Modal size="sm" bind:show>
	<div>
		<div class=" flex justify-between dark:text-gray-100 px-5 pt-4 pb-2">
			<div class=" text-lg font-medium self-center font-primary">
				{#if edit}
					{$i18n.t('Edit Audio Connection')}
				{:else}
					{$i18n.t('Add Audio Connection')}
				{/if}
			</div>
			<button
				class="self-center"
				on:click={() => {
					show = false;
					seededFor = null;
				}}
				type="button"
			>
				<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
					<path
						d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
					/>
				</svg>
			</button>
		</div>

		<div class="flex flex-col w-full px-4 pb-4 dark:text-gray-200">
			<form
				class="flex flex-col w-full"
				on:submit={(e) => {
					e.preventDefault();
					submitHandler();
				}}
			>
				{#if !selectedType}
					<!-- Type-first: present the kinds, no type-specific field yet. -->
					<div class="px-1">
						<div class="mb-1.5 text-xs text-gray-500">{$i18n.t('Connection Type')}</div>
						<div class="flex flex-col gap-1.5">
							{#each types as t (t.type)}
								<button
									type="button"
									class="w-full text-left px-3 py-2 rounded-lg text-sm bg-gray-50 hover:bg-gray-100 dark:bg-gray-850 dark:hover:bg-gray-800 transition"
									on:click={() => chooseType(t.type)}
								>
									<div class="font-medium">{t.label}</div>
									<div class="text-xs text-gray-500">
										{t.capabilities.map((c) => c.toUpperCase()).join(' + ')}{t.self_hosted
											? ` · ${$i18n.t('self-hosted')}`
											: ''}
									</div>
								</button>
							{/each}
						</div>
					</div>
				{:else}
					<div class="px-1">
						<div class="flex justify-between items-center mb-1.5">
							<div class="text-xs text-gray-500">
								{chosen?.label ?? selectedType}
							</div>
							{#if !edit}
								<button
									type="button"
									class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
									on:click={() => {
										selectedType = null;
										fieldValues = {};
									}}
								>
									{$i18n.t('Change type')}
								</button>
							{/if}
						</div>

						<div class="flex flex-col gap-2">
							{#each chosen?.fields ?? [] as f (f.name)}
								<div class="flex flex-col w-full">
									<div class="mb-0.5 text-xs text-gray-500">{f.label}</div>
									{#if f.secret}
										<SensitiveInput
											placeholder={edit ? $i18n.t('Leave blank to keep current') : f.label}
											bind:value={fieldValues[f.name]}
											required={false}
										/>
									{:else}
										<input
											class="w-full text-sm bg-transparent placeholder:text-gray-300 dark:placeholder:text-gray-700 outline-none"
											type="text"
											placeholder={f.label}
											autocomplete="off"
											bind:value={fieldValues[f.name]}
										/>
									{/if}
								</div>
							{/each}

							{#if (chosen?.fields ?? []).length === 0}
								<div class="text-xs text-gray-500">
									{$i18n.t('This connection type has no configurable fields.')}
								</div>
							{/if}
						</div>
					</div>

					<div class="flex justify-between pt-3 text-sm font-medium gap-1.5">
						{#if edit}
							<button
								class="px-3.5 py-1.5 text-sm font-medium dark:bg-black dark:hover:bg-gray-900 dark:text-white bg-white text-gray-800 hover:bg-gray-100 transition rounded-full"
								type="button"
								on:click={() => {
									onDelete();
									show = false;
									seededFor = null;
								}}
							>
								{$i18n.t('Delete')}
							</button>
						{:else}
							<div></div>
						{/if}

						<button
							class="px-3.5 py-1.5 text-sm font-medium bg-black hover:bg-gray-900 text-white dark:bg-white dark:text-black dark:hover:bg-gray-100 transition rounded-full"
							type="submit"
						>
							{$i18n.t('Save')}
						</button>
					</div>
				{/if}
			</form>
		</div>
	</div>
</Modal>
