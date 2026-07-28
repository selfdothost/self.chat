import { describe, it, expect } from 'vitest';
import { seedFromFolderPreset } from './folder-preset';

const options = {
	modelIds: ['llama3', 'gpt'],
	toolIds: ['calc', 'weather'],
	knowledgeBases: [
		{ id: 'kb1', name: 'Alpha KB' },
		{ id: 'kb2', name: 'Beta KB' }
	]
};

describe('seedFromFolderPreset (CS/R2)', () => {
	it('seeds the selected model from the preset default when it exists', () => {
		const seed = seedFromFolderPreset({ default_model_id: 'llama3' }, options);
		expect(seed.selectedModels).toEqual(['llama3']);
	});

	it('does not seed a model that no longer exists', () => {
		const seed = seedFromFolderPreset({ default_model_id: 'ghost' }, options);
		expect(seed.selectedModels).toBeUndefined();
	});

	it('seeds tools filtered to those that currently exist', () => {
		const seed = seedFromFolderPreset({ tool_ids: ['calc', 'gone'] }, options);
		expect(seed.selectedToolIds).toEqual(['calc']);
	});

	it('attaches knowledge as collection attachments in the composer shape', () => {
		const seed = seedFromFolderPreset({ knowledge_ids: ['kb1'] }, options);
		expect(seed.knowledgeCollections).toEqual([
			{ id: 'kb1', name: 'Alpha KB', type: 'collection', status: 'processed' }
		]);
	});

	it('reads the full meta.preset shape at once', () => {
		const seed = seedFromFolderPreset(
			{ default_model_id: 'gpt', tool_ids: ['weather'], knowledge_ids: ['kb2'] },
			options
		);
		expect(seed.selectedModels).toEqual(['gpt']);
		expect(seed.selectedToolIds).toEqual(['weather']);
		expect(seed.knowledgeCollections?.[0].id).toBe('kb2');
	});
});

describe('seedFromFolderPreset web_search sentinel', () => {
	it('seeds webSearchEnabled when the preset carries web_search and it is currently enabled', () => {
		const seed = seedFromFolderPreset(
			{ tool_ids: ['web_search'] },
			{ ...options, webSearchEnabled: true }
		);
		expect(seed.webSearchEnabled).toBe(true);
		// The sentinel is not a real tool -- never surfaces in selectedToolIds.
		expect(seed.selectedToolIds).toEqual([]);
	});

	it('does not seed webSearchEnabled when the capability is currently disabled', () => {
		const seed = seedFromFolderPreset(
			{ tool_ids: ['web_search'] },
			{ ...options, webSearchEnabled: false }
		);
		expect(seed.webSearchEnabled).toBeUndefined();
	});

	it('defaults webSearchEnabled option to false when the caller omits it', () => {
		const seed = seedFromFolderPreset({ tool_ids: ['web_search'] }, options);
		expect(seed.webSearchEnabled).toBeUndefined();
	});

	it('seeds both real tools and web_search together', () => {
		const seed = seedFromFolderPreset(
			{ tool_ids: ['calc', 'web_search'] },
			{ ...options, webSearchEnabled: true }
		);
		expect(seed.selectedToolIds).toEqual(['calc']);
		expect(seed.webSearchEnabled).toBe(true);
	});
});

describe('seedFromFolderPreset empty/partial (CS/R3)', () => {
	it('seeds nothing for an absent preset (no special empty-folder branch)', () => {
		expect(seedFromFolderPreset(undefined, options)).toEqual({});
		expect(seedFromFolderPreset(null, options)).toEqual({});
		expect(seedFromFolderPreset({}, options)).toEqual({});
	});

	it('seeds nothing for empty arrays / empty model', () => {
		const seed = seedFromFolderPreset(
			{ default_model_id: '', tool_ids: [], knowledge_ids: [] },
			options
		);
		expect(seed).toEqual({});
	});

	it('a partial preset seeds only the set fields, leaving the rest at defaults', () => {
		const seed = seedFromFolderPreset({ default_model_id: 'llama3' }, options);
		expect(seed.selectedModels).toEqual(['llama3']);
		// Tools and knowledge are untouched (undefined -> caller keeps defaults).
		expect(seed.selectedToolIds).toBeUndefined();
		expect(seed.knowledgeCollections).toBeUndefined();
	});
});
