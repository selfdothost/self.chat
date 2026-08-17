import { render, fireEvent, screen, waitFor } from '@testing-library/svelte';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writable } from 'svelte/store';
import { models, tools, knowledge as knowledgeCollections, config } from '$lib/stores';
import FolderConfigModal from './FolderConfigModal.svelte';

// The modal loads tool/knowledge options on open via these APIs; mock them so the
// pickers get non-empty option sets under jsdom.
const toolsFixture = [
	{ id: 'calc', name: 'Calculator' },
	{ id: 'weather', name: 'Weather' }
];
const knowledgeFixture = [
	{ id: 'kb1', name: 'Alpha KB', type: 'collection' },
	{ id: 'kb2', name: 'Beta KB', type: 'collection' }
];

vi.mock('$lib/apis/tools', () => ({
	getTools: vi.fn(async () => toolsFixture)
}));
vi.mock('$lib/apis/knowledge', () => ({
	getKnowledgeBases: vi.fn(async () => knowledgeFixture)
}));
vi.mock('$lib/apis/folders', () => ({
	updateFolderPresetById: vi.fn()
}));

import { updateFolderPresetById } from '$lib/apis/folders';
 
const updatePresetMock = updateFolderPresetById as unknown as ReturnType<typeof vi.fn>;

const modelsFixture = [
	{ id: 'llama3', name: 'Llama 3', owned_by: 'ollama' },
	{ id: 'gpt', name: 'GPT', owned_by: 'openai' }
];

const i18nStore = writable({ t: (k: string) => k });

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
	Object.defineProperty(window, 'localStorage', {
		value: { token: 'test-token', getItem: () => null, setItem: () => {} },
		configurable: true
	});
});

beforeEach(() => {
	models.set(modelsFixture as never);
	tools.set([] as never);
	knowledgeCollections.set([] as never);
	config.set(undefined as never);
});

// NOTE: the model trigger's DOM id is keyed by folder id (self.chat#39), so the
// lookups below use `...-f1-...` to match this default folder. Change the id
// here and the getElementById calls must follow.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderModal(show: boolean, folder: any = { id: 'f1', name: 'Folder', meta: {} }) {
	return render(FolderConfigModal, {
		props: { show, folder },
		context: new Map([['i18n', i18nStore]])
	});
}

// The checkmark path rendered by Checkbox.svelte when a tool is selected.
const CHECKED_PATH = 'path[d="m5 12 4.7 4.5 9.3-9"]';

describe('FolderConfigModal (FC/R2)', () => {
	it('visibility follows the bound boolean: hidden when show=false', () => {
		renderModal(false);
		expect(screen.queryByText('Configure')).toBeNull();
	});

	it('visibility follows the bound boolean: shown when show=true', async () => {
		renderModal(true);
		await waitFor(() => expect(screen.queryByText('Configure')).not.toBeNull());
	});

	it('renders the three reused pickers with non-empty option sets', async () => {
		renderModal(true);

		// Wait until options are loaded and the pickers are rendered.
		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		// (2) Tool-set picker — renders a selectable entry per available tool.
		await waitFor(() => expect(screen.queryByText('Calculator')).not.toBeNull());
		expect(screen.queryByText('Weather')).not.toBeNull();

		// (3) Knowledge picker — the reused Studio Knowledge picker's entry point.
		expect(screen.queryByText('Select Knowledge')).not.toBeNull();

		// (1) Single default-model picker primitive — open it and assert it exposes
		// the available models as selectable options.
		const modelTrigger = document.getElementById('model-selector-folder-config-model-f1-button');
		expect(modelTrigger).not.toBeNull();
		await fireEvent.keyDown(modelTrigger as Element, { key: 'Enter' });
		await waitFor(() =>
			expect(screen.getAllByLabelText('model-item').length).toBeGreaterThan(0)
		);
	});
});

describe('FolderConfigModal pre-populates from the folder preset (FC/R3)', () => {
	it('reflects a populated preset as each picker initial selection', async () => {
		renderModal(true, {
			id: 'f1',
			name: 'Folder',
			meta: {
				preset: {
					default_model_id: 'llama3',
					tool_ids: ['calc'],
					knowledge_ids: ['kb1']
				}
			}
		});

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		// Model: the picker trigger reflects the stored default model's label.
		const modelTrigger = document.getElementById('model-selector-folder-config-model-f1-button');
		await waitFor(() => expect(modelTrigger?.textContent).toContain('Llama 3'));

		// Knowledge: the stored knowledge (present in options) appears pre-attached.
		expect(screen.queryByText('Alpha KB')).not.toBeNull();
		// The unselected collection is not attached.
		expect(screen.queryByText('Beta KB')).toBeNull();

		// Tools: exactly the stored tool is checked (one rendered checkmark).
		expect(document.querySelectorAll(CHECKED_PATH).length).toBe(1);
	});

	it('opens fully empty when the folder has no stored preset', async () => {
		renderModal(true, { id: 'f1', name: 'Folder', meta: {} });

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		// Model: placeholder, not a model label.
		const modelTrigger = document.getElementById('model-selector-folder-config-model-f1-button');
		expect(modelTrigger?.textContent).toContain('Select a model');
		expect(modelTrigger?.textContent).not.toContain('Llama 3');

		// Knowledge: nothing attached.
		expect(screen.queryByText('Alpha KB')).toBeNull();
		expect(screen.queryByText('Beta KB')).toBeNull();

		// Tools: nothing checked.
		expect(document.querySelectorAll(CHECKED_PATH).length).toBe(0);
	});

	it('a stored tool/knowledge ref in the option set is pre-selected without re-pick', async () => {
		// Both refs exist in the loaded option sets -> they must show as selected on
		// open (no user interaction), so a save preserves them.
		renderModal(true, {
			id: 'f1',
			name: 'Folder',
			meta: { preset: { tool_ids: ['weather'], knowledge_ids: ['kb2'] } }
		});

		await waitFor(() => expect(screen.queryByText('Select Knowledge')).not.toBeNull());

		expect(screen.queryByText('Beta KB')).not.toBeNull();
		expect(document.querySelectorAll(CHECKED_PATH).length).toBe(1);
	});
});

describe('FolderConfigModal persists via the folders API (FC/R4)', () => {
	beforeEach(() => {
		updatePresetMock.mockReset();
	});

	const presetFolder = {
		id: 'f1',
		name: 'Folder',
		meta: {
			preset: { default_model_id: 'llama3', tool_ids: ['calc'], knowledge_ids: ['kb1'] }
		}
	};

	it('submits all three preset fields and closes on success', async () => {
		updatePresetMock.mockResolvedValue({ ok: true });
		renderModal(true, presetFolder);

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		// The submitted payload equals the current selection (a re-read reflects it).
		expect(updatePresetMock).toHaveBeenCalledWith('test-token', 'f1', {
			name: 'Folder',
			default_model_id: 'llama3',
			tool_ids: ['calc'],
			knowledge_ids: ['kb1']
		});
		// Success closes the modal.
		await waitFor(() => expect(screen.queryByText('Default Model')).toBeNull());
	});

	it('surfaces one generic error on rejection and does not close or leak detail', async () => {
		// Backend rejects with a detailed message; the modal must NOT echo it.
		updatePresetMock.mockRejectedValue('knowledge kb1 is inaccessible');
		renderModal(true, presetFolder);

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		await fireEvent.click(screen.getByText('Save'));

		const alert = await screen.findByRole('alert');
		expect(alert.textContent).toContain('Failed to save configuration');
		// No per-field / missing-vs-inaccessible detail leaked.
		expect(alert.textContent).not.toContain('kb1');
		expect(alert.textContent).not.toContain('inaccessible');
		expect(alert.textContent).not.toContain('knowledge');
		// Modal stays open on failure.
		expect(screen.queryByText('Default Model')).not.toBeNull();
	});

	it('does not run per-field client-side reference validation before submit', async () => {
		// A preset referencing a model NOT in the loaded option set must still be
		// submitted verbatim -- the backend is authoritative, no client pre-check.
		updatePresetMock.mockResolvedValue({ ok: true });
		renderModal(true, {
			id: 'f2',
			name: 'Folder2',
			meta: { preset: { default_model_id: 'ghost-model', tool_ids: [], knowledge_ids: [] } }
		});

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());
		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		expect(updatePresetMock).toHaveBeenCalledWith('test-token', 'f2', {
			name: 'Folder2',
			default_model_id: 'ghost-model',
			tool_ids: [],
			knowledge_ids: []
		});
	});
});

describe('FolderConfigModal explicit clear persists as a clear (FC/R5)', () => {
	beforeEach(() => {
		updatePresetMock.mockReset();
		updatePresetMock.mockResolvedValue({ ok: true });
	});

	const fullPreset = {
		id: 'f1',
		name: 'Folder',
		meta: {
			preset: { default_model_id: 'llama3', tool_ids: ['calc'], knowledge_ids: ['kb1'] }
		}
	};

	it('removing the model submits an explicit empty default_model_id', async () => {
		renderModal(true, fullPreset);
		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		// Remove the pre-selected model, then save.
		await fireEvent.click(screen.getByText('Remove'));
		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		const payload = updatePresetMock.mock.calls[0][2];
		expect(payload.default_model_id).toBeNull();
		// Key is present (explicit clear, not omitted); other fields preserved.
		expect('default_model_id' in payload).toBe(true);
		expect(payload.tool_ids).toEqual(['calc']);
		expect(payload.knowledge_ids).toEqual(['kb1']);
	});

	it('unchecking all tools submits an explicit empty tool_ids', async () => {
		renderModal(true, fullPreset);
		await waitFor(() => expect(screen.queryByText('Calculator')).not.toBeNull());

		// Uncheck the pre-selected tool (the checked checkbox next to "Calculator").
		const checkedBox = document
			.querySelector(CHECKED_PATH)
			?.closest('button') as HTMLButtonElement;
		expect(checkedBox).toBeTruthy();
		await fireEvent.click(checkedBox);

		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		const payload = updatePresetMock.mock.calls[0][2];
		expect(payload.tool_ids).toEqual([]);
		expect('tool_ids' in payload).toBe(true);
	});

	it('removing all knowledge submits an explicit empty knowledge_ids', async () => {
		renderModal(true, fullPreset);
		await waitFor(() => expect(screen.queryByText('Alpha KB')).not.toBeNull());

		// Dismiss the attached knowledge (the FileItem X button).
		const dismissBtn = Array.from(document.querySelectorAll('button')).find((b) =>
			b.innerHTML.includes('M6.28 5.22')
		) as HTMLButtonElement;
		expect(dismissBtn).toBeTruthy();
		await fireEvent.click(dismissBtn);

		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		const payload = updatePresetMock.mock.calls[0][2];
		expect(payload.knowledge_ids).toEqual([]);
		expect('knowledge_ids' in payload).toBe(true);
	});

	it('always submits all three fields together (empty is a value, not an omission)', async () => {
		// Empty-preset folder: saving submits all three keys with empty values.
		renderModal(true, { id: 'f9', name: 'Empty', meta: {} });
		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());

		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		const payload = updatePresetMock.mock.calls[0][2];
		expect(Object.keys(payload).sort()).toEqual([
			'default_model_id',
			'knowledge_ids',
			'name',
			'tool_ids'
		]);
		expect(payload.default_model_id).toBeNull();
		expect(payload.tool_ids).toEqual([]);
		expect(payload.knowledge_ids).toEqual([]);
	});
});

describe('FolderConfigModal Web Search tool option', () => {
	beforeEach(() => {
		updatePresetMock.mockReset();
		updatePresetMock.mockResolvedValue({ ok: true });
	});

	it('does not offer Web Search as a tool option when the capability is disabled', async () => {
		config.set({ features: { enable_web_search: false } } as never);
		renderModal(true, { id: 'f1', name: 'Folder', meta: {} });

		await waitFor(() => expect(screen.queryByText('Default Model')).not.toBeNull());
		expect(screen.queryByText('Web Search')).toBeNull();
	});

	it('offers Web Search as a selectable tool option when the capability is enabled', async () => {
		config.set({ features: { enable_web_search: true } } as never);
		renderModal(true, { id: 'f1', name: 'Folder', meta: {} });

		await waitFor(() => expect(screen.queryByText('Web Search')).not.toBeNull());
	});

	it('selecting Web Search and saving includes it in the submitted tool_ids', async () => {
		config.set({ features: { enable_web_search: true } } as never);
		renderModal(true, { id: 'f1', name: 'Folder', meta: {} });

		await waitFor(() => expect(screen.queryByText('Web Search')).not.toBeNull());

		const webSearchNameDiv = screen.getByText('Web Search');
		const webSearchCheckbox = webSearchNameDiv.previousElementSibling?.querySelector(
			'button'
		) as HTMLButtonElement;
		expect(webSearchCheckbox).toBeTruthy();
		await fireEvent.click(webSearchCheckbox);

		await fireEvent.click(screen.getByText('Save'));

		await waitFor(() => expect(updatePresetMock).toHaveBeenCalledTimes(1));
		const payload = updatePresetMock.mock.calls[0][2];
		expect(payload.tool_ids).toEqual(['web_search']);
	});

	it('pre-populates Web Search as checked when the stored preset carries it and the capability is enabled', async () => {
		config.set({ features: { enable_web_search: true } } as never);
		renderModal(true, {
			id: 'f1',
			name: 'Folder',
			meta: { preset: { tool_ids: ['web_search'] } }
		});

		await waitFor(() => expect(screen.queryByText('Web Search')).not.toBeNull());
		expect(document.querySelectorAll(CHECKED_PATH).length).toBe(1);
	});
});

describe('FolderConfigModal composes existing pickers only (FC/R2, feeds FC/R6)', () => {
	const src = readFileSync(
		resolve(
			process.cwd(),
			'src/lib/components/layout/Sidebar/Folders/FolderConfigModal.svelte'
		),
		'utf-8'
	);

	it('imports the composer single-model primitive, not the wrapper', () => {
		expect(src).toContain("$lib/components/chat/ModelSelector/Selector.svelte");
		// Must NOT import the ModelSelector wrapper (composer side effects).
		expect(src).not.toContain("import ModelSelector from '$lib/components/chat/ModelSelector.svelte'");
	});

	it('imports the Studio tool-set and Knowledge pickers', () => {
		expect(src).toContain("$lib/components/studio/Models/ToolsSelector.svelte");
		expect(src).toContain("$lib/components/studio/Models/Knowledge.svelte");
	});

	it('defines no new picker/selector component of its own', () => {
		// The modal is composition-only: no local <select>-style picker markup or
		// bespoke selector logic beyond reusing the imported components.
		expect(src).not.toMatch(/function\s+\w*Selector/);
	});
});
