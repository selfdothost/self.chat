<script lang="ts">
    import Selector from './Selector.svelte';
    import type { Model } from '$lib/stores';

    interface Props {
        items?: {
            label: string;
            value: string;
            model: Model;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            [key: string]: any;
        }[];
    }

    let { items = [] }: Props = $props();
</script>

<!-- `items` starts EMPTY on purpose. In the app, ModelSelector passes
     `items={$models.filter(...).map(...)}` and the `models` store is
     `writable([])` until /api/models resolves, so Selector always
     initializes with []. The test pushes a populated list in via rerender --
     the same reactive prop update the store drives in production. -->
<Selector id="0" {items} />
