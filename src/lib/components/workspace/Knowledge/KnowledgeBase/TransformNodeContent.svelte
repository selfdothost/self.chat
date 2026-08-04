<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import type { NodeTemplate } from "./nodeTemplate";
    
    const dispatch = createEventDispatcher();
    
    interface Props {
        template: NodeTemplate;
        config?: Record<string, unknown>;
    }

    let { template, config = {} }: Props = $props();

    // Param values vary by param.type below: boolean, number, string,
    // string_list (string[]), or null when a numeric field is cleared.
    type TransformParamValue = string | number | boolean | string[] | null;
    let params = $derived((config.params ?? {}) as Record<string, TransformParamValue>);

    function updateParam(name: string, value: TransformParamValue) {
            dispatch('configchange', {...config, params: { ...params, [name]: value}})
    }
</script>

<div class="text-gray-600 dark:text-gray-400 space-y-2">
    {#each template.params as param (param.name)}
        <div>
            <div class="mb-0.5 text-[10px] text-gray-500 flex items-center gap-1">
                {param.label}
                {#if param.required}<span class="text-red-400">*</span>{/if}
            </div>
            {#if param.type === 'boolean'}
                <label class="flex items-center gap-1.5 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={(() => {
                            const v = params[param.name] ?? param.default ?? false;
                            return typeof v === 'boolean' ? v : false;
                        })()}
                        onchange={(e) => updateParam(param.name, e.currentTarget.checked)}
                        class="rounded border-gray-300 dark:border-gray-600"
                    />
                </label>
            {:else if param.type === 'number'}
                <input
                    type="number"
                    value={params[param.name]?? param.default ?? ''}
                    placeholder={param.required ? 'required' : 'optional'}
                    oninput={(e) => {
                        const v = e.currentTarget.value;
                        updateParam(param.name, v === '' ? null : Number(v));
                    }}
                    class="w-full rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 outline-hidden"
                />
            {:else if param.type === 'string_list'}
                <textarea
                    value={(() => {
                        const v = params[param.name] ?? param.default ?? [];
                        return Array.isArray(v) ? v.join('\n') : '';
                    })()}
                    placeholder={param.required ? 'required (one per line)' : 'optional (one per line)'}
                    oninput={(e) => updateParam(param.name, e.currentTarget.value.split('\n').filter(s => s.trim() !== ''))}
                    rows="3"
                    class="w-full rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 outline-hidden resize-y"
></textarea>
            {:else if param.type === 'select'}
                <select
                    value={params[param.name] ?? param.default ?? ''}
                    onchange={(e) => updateParam(param.name, e.currentTarget.value)}
                    class="w-full rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 outline-hidden"
                >
                    {#each param.options ?? [] as opt (opt)}
                        <option value={opt}>{opt}</option>
                    {/each}
                </select>
            {:else}
                <input
					type="text"
					value={params[param.name] ?? param.default ?? ''}
					placeholder={param.required ? 'required' : 'optional'}
					oninput={(e) => updateParam(param.name, e.currentTarget.value)}
					class="w-full rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 outline-hidden"
				/>
            {/if}
        </div>
    {/each}
</div>