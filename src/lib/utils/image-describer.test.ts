import { describe, it, expect } from 'vitest';

import {
	DESCRIBER_ADMIN_CONFIG_KEY,
	DESCRIBER_ADMIN_CONFIG_SUBKEY,
	DESCRIBER_FEATURE_FLAG,
	DESCRIBER_MODEL_FIELD,
	DESCRIBER_STATUS_ACTION,
	adminConfigWithDescriber,
	describerAvailable,
	emptyDescriberSettings,
	modelsThatCanSee,
	readAdminDescriberSettings,
	userMayOverrideDescriberModel,
	userMayUseDescriber
} from './image-describer';

// self.chat#54, against the contract self.ai#142 published (and shipped in
// !470). The composer's decision to attach-and-enable rather than refuse is
// made entirely by describerAvailable(), so this is where the conditions are
// actually pinned down.

/* eslint-disable @typescript-eslint/no-explicit-any */
const publicConfig = (features: unknown): any => ({ features });
const adminConfig = (settings: unknown): any => ({
	[DESCRIBER_ADMIN_CONFIG_KEY]: { [DESCRIBER_ADMIN_CONFIG_SUBKEY]: settings }
});
const asUser = (u: unknown): any => u;
const asModels = (m: unknown): any => m;
/* eslint-enable @typescript-eslint/no-explicit-any */

const enabled = publicConfig({ enable_image_input_describer: true });
const permitted = asUser({
	role: 'user',
	permissions: { features: { image_input_describer: true } }
});

describe('the published names are the ones #142 shipped', () => {
	it('uses the one `image_input_describer` stem across every surface', () => {
		expect(DESCRIBER_FEATURE_FLAG).toBe('image_input_describer');
		expect(DESCRIBER_MODEL_FIELD).toBe('image_input_describer_model');
		expect(DESCRIBER_STATUS_ACTION).toBe('image_input_describer');
		expect(DESCRIBER_ADMIN_CONFIG_KEY).toBe('input');
		expect(DESCRIBER_ADMIN_CONFIG_SUBKEY).toBe('describer');
	});
});

describe('describerAvailable: the published flag plus the permission', () => {
	it('is available when the instance publishes the flag and the user is permitted', () => {
		expect(describerAvailable(enabled, permitted)).toBe(true);
	});

	it('is unavailable when the instance does not publish the flag', () => {
		expect(
			describerAvailable(publicConfig({ enable_image_input_describer: false }), permitted)
		).toBe(false);
	});

	it('is unavailable when the user lacks the base permission', () => {
		const denied = asUser({
			role: 'user',
			permissions: { features: { image_input_describer: false } }
		});
		expect(describerAvailable(enabled, denied)).toBe(false);
	});

	it('is unavailable against a config that carries no such flag', () => {
		expect(describerAvailable(publicConfig({}), permitted)).toBe(false);
		expect(describerAvailable(undefined, permitted)).toBe(false);
	});

	it('is unavailable with no user at all', () => {
		expect(describerAvailable(enabled, undefined)).toBe(false);
	});
});

describe('userMayUseDescriber: absent means denied', () => {
	it('does not read a missing permission as granted', () => {
		expect(userMayUseDescriber(asUser({ role: 'user' }))).toBe(false);
		expect(userMayUseDescriber(asUser({ role: 'user', permissions: {} }))).toBe(false);
		expect(userMayUseDescriber(asUser({ role: 'user', permissions: { features: {} } }))).toBe(false);
	});

	it('does not read a truthy non-boolean as granted', () => {
		expect(
			userMayUseDescriber(
				asUser({ role: 'user', permissions: { features: { image_input_describer: 'yes' } } })
			)
		).toBe(false);
	});

	it('grants it to admins, who are not subject to feature permissions', () => {
		expect(userMayUseDescriber(asUser({ role: 'admin' }))).toBe(true);
		expect(describerAvailable(enabled, asUser({ role: 'admin' }))).toBe(true);
	});
});

describe('userMayOverrideDescriberModel: the base grant is a precondition', () => {
	it('grants it only when both permissions are held', () => {
		expect(
			userMayOverrideDescriberModel(
				asUser({
					role: 'user',
					permissions: {
						features: { image_input_describer: true, image_input_describer_override: true }
					}
				})
			)
		).toBe(true);
	});

	it('refuses the override held WITHOUT the base grant', () => {
		// #142 401s this regardless of what the group blob says. A client that
		// offered it anyway would present an option the server always refuses.
		expect(
			userMayOverrideDescriberModel(
				asUser({
					role: 'user',
					permissions: {
						features: { image_input_describer: false, image_input_describer_override: true }
					}
				})
			)
		).toBe(false);
	});

	it('refuses the base grant alone', () => {
		expect(userMayOverrideDescriberModel(permitted)).toBe(false);
	});

	it('grants it to admins', () => {
		expect(userMayOverrideDescriberModel(asUser({ role: 'admin' }))).toBe(true);
	});
});

describe('admin config round-trip: input.describer', () => {
	it('reads an absent key as off and unconfigured', () => {
		expect(readAdminDescriberSettings({})).toEqual(emptyDescriberSettings());
		expect(readAdminDescriberSettings(undefined)).toEqual({ enabled: false, model: '' });
		expect(readAdminDescriberSettings({ input: {} })).toEqual({ enabled: false, model: '' });
	});

	it('reads a stored setting back out of the nested shape', () => {
		expect(readAdminDescriberSettings(adminConfig({ enabled: true, model: 'vl-7b' }))).toEqual({
			enabled: true,
			model: 'vl-7b'
		});
	});

	it('coerces junk rather than propagating it into the form', () => {
		expect(readAdminDescriberSettings(adminConfig({ enabled: 'true', model: 42 }))).toEqual({
			enabled: false,
			model: ''
		});
	});

	it('writes back into the same nested shape it reads', () => {
		const written = adminConfigWithDescriber({}, { enabled: true, model: 'vl-7b' });

		expect(written).toEqual({ input: { describer: { enabled: true, model: 'vl-7b' } } });
		expect(readAdminDescriberSettings(written)).toEqual({ enabled: true, model: 'vl-7b' });
	});

	it('leaves the rest of the images config alone', () => {
		const written = adminConfigWithDescriber(
			{ enabled: true, engine: 'comfyui' },
			emptyDescriberSettings()
		);

		expect(written.enabled).toBe(true);
		expect(written.engine).toBe('comfyui');
	});

	it('does not clobber other members of the input namespace', () => {
		// `input` is a namespace for input-side image settings generally. Writing
		// the describer must merge, not overwrite, or the first sibling setting
		// added server-side is silently dropped on every admin save.
		const written = adminConfigWithDescriber(
			{ input: { some_other_input_setting: 'kept' } },
			{ enabled: true, model: 'vl-7b' }
		) as Record<string, Record<string, unknown>>;

		expect(written.input.some_other_input_setting).toBe('kept');
		expect(written.input.describer).toEqual({ enabled: true, model: 'vl-7b' });
	});
});

describe('modelsThatCanSee: only an explicit claim qualifies', () => {
	const model = (id: string, vision: unknown, owned_by = 'llamolotl') => ({
		id,
		name: id,
		owned_by,
		info: { meta: { capabilities: vision === undefined ? null : { vision } } }
	});

	it('offers models declaring vision', () => {
		const picked = modelsThatCanSee(asModels([model('vl', true), model('text', false)]));
		expect(picked.map((m) => m.id)).toEqual(['vl']);
	});

	it('does not offer a model whose capability is merely unknown', () => {
		// Unknown is enough to PERMIT a send; it is not enough to make something
		// the instance's describer. Those two decisions differ on purpose.
		expect(modelsThatCanSee(asModels([model('unannotated', undefined)]))).toEqual([]);
	});

	it('does not offer arena pseudo-models', () => {
		expect(modelsThatCanSee(asModels([model('arena-pair', true, 'arena')]))).toEqual([]);
	});

	it('survives an empty catalog', () => {
		expect(modelsThatCanSee(undefined)).toEqual([]);
		expect(modelsThatCanSee([])).toEqual([]);
	});
});
