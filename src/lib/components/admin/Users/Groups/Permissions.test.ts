import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import { writable } from 'svelte/store';
import Permissions from './Permissions.svelte';

// Permissions.svelte reads `getContext('i18n')` for every label (including
// ones untouched by this change, e.g. the "Tools Access" tooltip) -- render()
// must supply it or any render throws on the first $i18n.t() call.
const i18nStore = writable({ t: (k: string) => k });
const renderPermissions = (props: Record<string, unknown>) =>
	render(Permissions, { props, context: new Map([['i18n', i18nStore]]) });

const basePermissions = () => ({
	workspace: {
		models: false,
		knowledge: false,
		prompts: false,
		training: false,
		evaluations: false,
		tools: false
	},
	chat: {
		delete: true,
		edit: true,
		temporary: true,
		file_upload: true
	}
});

const referenceMod = {
	id: 'reference',
	name: 'Reference Mod',
	scopes: [{ id: 'mods.reference.use', desc: "Use the reference mod's tool, route, and namespace." }]
};

// Reads a nested value off the mutated `permissions` object without an `any`
// cast -- permissions.mods is arbitrarily deep (one level per scope-id
// segment), so a typed getter is simpler here than narrowing a union type
// at every call site.
const readNested = (obj: unknown, path: string[]): unknown => {
	let node: unknown = obj;
	for (const key of path) {
		if (node == null || typeof node !== 'object') return undefined;
		node = (node as Record<string, unknown>)[key];
	}
	return node;
};

describe('Permissions', () => {
	it('renders no Mod Permissions section when no mods are loaded', () => {
		const { queryByText } = renderPermissions({ permissions: basePermissions(), mods: [] });
		expect(queryByText('Mod Permissions')).toBeNull();
	});

	it("renders a toggle per declared scope, labelled with the scope's desc", () => {
		const { getByText } = renderPermissions({ permissions: basePermissions(), mods: [referenceMod] });
		expect(getByText('Mod Permissions')).toBeTruthy();
		expect(getByText('Reference Mod')).toBeTruthy();
		expect(getByText("Use the reference mod's tool, route, and namespace.")).toBeTruthy();
	});

	it('toggling a mod scope switch writes the grant into permissions.mods.<id>.<scope>', async () => {
		const permissions = basePermissions();
		const { getAllByRole } = renderPermissions({ permissions, mods: [referenceMod] });

		const switches = getAllByRole('switch');
		const modSwitch = switches[switches.length - 1];

		expect(readNested(permissions, ['mods', 'reference', 'use'])).not.toBe(true);
		await fireEvent.click(modSwitch);
		await waitFor(() => expect(readNested(permissions, ['mods', 'reference', 'use'])).toBe(true));
	});

	it('a mod scope with a nested path (e.g. "session.connect") writes through the full path', async () => {
		const nestedMod = {
			id: 'crew',
			name: 'Crew',
			scopes: [{ id: 'mods.crew.session.connect', desc: 'Connect a crew session.' }]
		};
		const permissions = basePermissions();
		const { getAllByRole } = renderPermissions({ permissions, mods: [nestedMod] });

		const switches = getAllByRole('switch');
		await fireEvent.click(switches[switches.length - 1]);
		await waitFor(() =>
			expect(readNested(permissions, ['mods', 'crew', 'session', 'connect'])).toBe(true)
		);
	});
});
