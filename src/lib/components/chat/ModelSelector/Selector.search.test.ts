import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writable } from 'svelte/store';
import type { Model } from '$lib/stores';
import Harness from './Selector.search.test.harness.svelte';

// Selector's onMount hits the Ollama API for the version; mock the module so
// the component mounts without a server (same convention as
// FolderConfigModal.test.ts mocking the APIs its modal loads).
vi.mock('$lib/apis/ollama', () => ({
    getOllamaVersion: vi.fn(async () => false),
    deleteModel: vi.fn(),
    pullModel: vi.fn()
}));

// jsdom shims required by bits-ui's floating/dropdown layer (copied from
// FolderMenu.test.ts, which mounts a DropdownMenu the same way).
beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
    Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
    Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
    Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => {});
});

const i18nStore = writable({ t: (k: string) => k });

const model = (id: string, name: string): Model =>
    ({
        id,
        name,
        owned_by: 'openai'
    }) as Model;

const lateItems = [
    { label: 'Llama 3', value: 'llama-3', model: model('llama-3', 'Llama 3') },
    { label: 'GPT-4o', value: 'gpt-4o', model: model('gpt-4o', 'GPT-4o') }
];

const openAndType = async (query: string) => {
    const trigger = document.getElementById('model-selector-0-button');
    if (!trigger) throw new Error('model selector trigger not found');
    // bits-ui menu triggers open on keyboard activation reliably in jsdom.
    await fireEvent.keyDown(trigger, { key: 'Enter' });

    const input = await screen.findByPlaceholderText('Search a model');
    await fireEvent.input(input, { target: { value: query } });
    return input;
};

describe('ModelSelector search (Selector.svelte)', () => {
    // The regression: the Fuse index was a `const` built once from the INITIAL
    // `items`, which is [] until /api/models resolves -- so searching always
    // hit a dead index and returned "No results found". The index must track
    // `items` and find models that arrive after mount.
    it('finds models whose items arrive after mount', async () => {
        const { rerender } = render(Harness, {
            props: { items: [] },
            context: new Map([['i18n', i18nStore]])
        });

        // Mount-time reality: items is empty, search honestly finds nothing.
        await openAndType('llama');
        await waitFor(() => expect(screen.getByText('No results found')).toBeTruthy());

        // /api/models resolves; the parent's `items` prop updates in place.
        await rerender({ items: lateItems });

        // The same query must now hit a REBUILT index: the matching model is
        // offered and the non-matching one is filtered out (so a pass proves
        // the search really ran, not that the list just re-rendered unfiltered).
        await waitFor(() =>
            expect(
                screen.queryByRole('button', { name: 'model-item', hidden: true })
            ).not.toBeNull()
        );
        expect(screen.getByText('Llama 3')).toBeTruthy();
        expect(screen.queryByText('GPT-4o')).toBeNull();
        expect(screen.queryByText('No results found')).toBeNull();
    });
});
