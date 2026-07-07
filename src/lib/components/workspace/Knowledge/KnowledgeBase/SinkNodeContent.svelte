<script lang="ts">
    import { createEventDispatcher } from "svelte";

    const dispatch = createEventDispatcher();

    export let config: Record<string, any> = {};
    export let stageLabel = "output";

    // The dataset name the curated output is saved under. Sent as dataset_name
    // when the pipeline is queued; blank falls back to the KB name on the server.
    function setName(value: string) {
        dispatch('configchange', { ...config, datasetName: value });
    }
</script>

<div class="text-gray-600 dark:text-gray-400 space-y-1.5">
    <div class="font-medium text-gray-800 dark:text-gray-200 text-[11px] uppercase tracking-wide">
        Output
    </div>
    <div>
        <div class="mb-0.5 text-[10px] text-gray-500">Dataset Name</div>
        <input
            type="text"
            value={config.datasetName ?? ''}
            placeholder="Curated dataset name"
            on:input={(e) => setName(e.currentTarget.value)}
            on:mousedown|stopPropagation
            class="w-full rounded bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-2 py-1 text-[11px] text-gray-700 dark:text-gray-300 outline-none"
        />
    </div>
    <div class="text-[10px] text-gray-400">Saves the output as a Dataset you can browse</div>
</div>
