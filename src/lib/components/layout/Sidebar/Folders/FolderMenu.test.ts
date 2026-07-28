import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { writable } from 'svelte/store';
import Harness from './FolderMenu.test.harness.svelte';

// jsdom shims required by bits-ui's floating/dropdown layer.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});
	Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture ?? (() => false);
	Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => {});
	Element.prototype.releasePointerCapture =
		Element.prototype.releasePointerCapture ?? (() => {});
});

const i18nStore = writable({ t: (k: string) => k });

async function openMenu(onEvent: (name: string) => void) {
	render(Harness, {
		props: { onEvent },
		context: new Map([['i18n', i18nStore]])
	});

	const trigger = screen.getByRole('button');
	// bits-ui v2 menu triggers open on keyboard activation reliably in jsdom.
	await fireEvent.keyDown(trigger, { key: 'Enter' });
	// Portal content lands on document.body once open.
	await waitFor(() => expect(screen.queryByText('Configure')).not.toBeNull());
}

describe('FolderMenu', () => {
	it('renders a Configure item alongside rename, export, and delete (FC/R1)', async () => {
		const onEvent = vi.fn();
		await openMenu(onEvent);

		expect(screen.queryByText('Configure')).not.toBeNull();
		expect(screen.queryByText('Rename')).not.toBeNull();
		expect(screen.queryByText('Export')).not.toBeNull();
		expect(screen.queryByText('Delete')).not.toBeNull();
	});

	it('renders a New Chat item (folder-scoped create affordance) (CS/R1)', async () => {
		const onEvent = vi.fn();
		await openMenu(onEvent);

		expect(screen.queryByText('New Chat')).not.toBeNull();
	});

	it('selecting New Chat dispatches only the newChat event (CS/R1)', async () => {
		const onEvent = vi.fn();
		await openMenu(onEvent);

		const item = screen.getByText('New Chat');
		await fireEvent.click(item);

		await waitFor(() => expect(onEvent).toHaveBeenCalledWith('newChat'));
		expect(onEvent).not.toHaveBeenCalledWith('configure');
		expect(onEvent).not.toHaveBeenCalledWith('rename');
		expect(onEvent).not.toHaveBeenCalledWith('export');
		expect(onEvent).not.toHaveBeenCalledWith('delete');
	});

	it('selecting Configure dispatches only the configure event (FC/R1)', async () => {
		const onEvent = vi.fn();
		await openMenu(onEvent);

		const item = screen.getByText('Configure');
		await fireEvent.click(item);

		await waitFor(() => expect(onEvent).toHaveBeenCalledWith('configure'));
		// It must take no other action: no rename/export/delete dispatched.
		expect(onEvent).not.toHaveBeenCalledWith('rename');
		expect(onEvent).not.toHaveBeenCalledWith('export');
		expect(onEvent).not.toHaveBeenCalledWith('delete');
	});
});
