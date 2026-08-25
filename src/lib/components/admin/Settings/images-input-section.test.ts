import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// self.chat#54 piece 2. Admin → Settings → Images gains an Input section above
// the existing generations config. Mounting this component means mounting the
// whole admin settings surface with a live images API behind it, and every
// component suite on this workstation fails to COLLECT anyway
// (@tailwindcss/postcss), so the structural claims are asserted against the
// source — same idiom as the chat guards.

const imagesSrc = readFileSync(
	resolve(process.cwd(), 'src/lib/components/admin/Settings/Images.svelte'),
	'utf-8'
);

describe('self.chat#54: Input sits above Generations', () => {
	it('renders both sections', () => {
		expect(imagesSrc).toContain("{$i18n.t('Input')}");
		expect(imagesSrc).toContain("{$i18n.t('Generations')}");
	});

	it('puts Input first', () => {
		// Ordering is the requirement, not just presence: an image arriving is the
		// first thing that happens to an image.
		expect(imagesSrc.indexOf("{$i18n.t('Input')}")).toBeLessThan(
			imagesSrc.indexOf("{$i18n.t('Generations')}")
		);
	});

	it('no longer labels the generation config as the whole of Image Settings', () => {
		expect(imagesSrc).not.toContain("{$i18n.t('Image Settings')}");
	});

	it('keeps the generation config it was carrying', () => {
		// The restructure must not quietly drop settings. Spot-check one from each
		// engine plus the shared ones.
		for (const setting of [
			'config.enabled',
			'config.engine',
			'config.automatic1111.AUTOMATIC1111_BASE_URL',
			'config.comfyui.COMFYUI_BASE_URL',
			'config.openai.OPENAI_API_KEY',
			'imageGenerationConfig.MODEL',
			'imageGenerationConfig.IMAGE_SIZE',
			'imageGenerationConfig.IMAGE_STEPS'
		]) {
			expect(imagesSrc).toContain(setting);
		}
	});
});

describe('self.chat#54: the Input settings', () => {
	it('offers a switch and a default vision model', () => {
		expect(imagesSrc).toContain('bind:state={describer.enabled}');
		expect(imagesSrc).toContain('bind:value={describer.model}');
	});

	it('only offers models that can actually see', () => {
		expect(imagesSrc).toContain('modelsThatCanSee($chatModels)');
		expect(imagesSrc).toContain('{#each visionModels as model (model.id)}');
	});

	it('does not let the picker silently swallow a stale default', () => {
		// A model that was deleted, or that self.ai#139 moved to a hard
		// `vision: false`, would otherwise vanish from the list and read as
		// "nothing configured" while still being the value that gets saved.
		expect(imagesSrc).toContain('describerModelIsStale');
	});

	it('refuses to save an enabled describer with no model', () => {
		// The composer treats "no default model" as unavailable, so storing that
		// combination gives an admin a setting that reads as on and behaves as off.
		const saveIdx = imagesSrc.indexOf('const saveHandler = async () => {');
		expect(saveIdx).toBeGreaterThan(-1);
		const guard = imagesSrc.slice(saveIdx, imagesSrc.indexOf('await updateConfig(', saveIdx));

		expect(guard).toContain("describer.enabled && describer.model === ''");
		expect(guard).toContain('return;');
	});

	it('sends the Input settings on every path that writes the images config', () => {
		// Both the explicit Save and the inline switches POST this config. Missing
		// either one loses the admin's Input edits.
		expect((imagesSrc.match(/updateConfig\(localStorage\.token, configWithDescriber\(\)\)/g) ?? []).length).toBe(2);
		expect(imagesSrc).not.toContain('updateConfig(localStorage.token, config)');
	});

	it('holds the Input settings apart from the server-owned config object', () => {
		// updateConfigHandler() overwrites `config` wholesale with the response, so
		// binding the form straight to config.input.describer would put the admin's
		// in-progress edits at the mercy of every Generations switch they touch.
		expect(imagesSrc).toContain('let describer = $state(emptyDescriberSettings());');
		expect(imagesSrc).toContain('describer = readAdminDescriberSettings(res);');
	});

	it('reads and writes self.ai#142\'s nested input.describer shape', () => {
		// The nesting lives in $lib/utils/image-describer (round-tripped in its own
		// tests), not inline here — this panel must not hand-roll the key path.
		expect(imagesSrc).toContain('adminConfigWithDescriber(config, describer)');
		expect(imagesSrc).not.toContain("[DESCRIBER_ADMIN_CONFIG_KEY]: { ...describer }");
	});

	it('no longer warns that the key names are provisional', () => {
		// #142 published the contract; the warning would now be a lie.
		expect(imagesSrc).not.toContain('DESCRIBER_NAMES_ARE_PROVISIONAL');
		expect(imagesSrc).not.toContain('provisional');
	});
});
