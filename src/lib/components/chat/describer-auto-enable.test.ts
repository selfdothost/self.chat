import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { DESCRIBER_FEATURE_FLAG, DESCRIBER_MODEL_FIELD } from '$lib/utils/image-describer';

// self.chat#54 piece 3. The decision itself — is the describer available —
// is unit-tested in src/lib/utils/image-describer.test.ts. What is left is
// control flow inside two components that between them own a socket, a router
// and a dozen stores, which is not reachable from a mounted unit test; so this
// is a static guard on the source, the same shape as
// vision-guard-error-persistence.test.ts next door.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8');

const messageInputSrc = read('src/lib/components/chat/MessageInput.svelte');
const chatSrc = read('src/lib/components/chat/Chat.svelte');
const inputMenuSrc = read('src/lib/components/chat/MessageInput/InputMenu.svelte');
const placeholderSrc = read('src/lib/components/chat/Placeholder.svelte');

/** Source with `//` comment lines removed — comments quote the old shapes. */
const code = (src: string) =>
	src
		.split('\n')
		.filter((line) => !line.trim().startsWith('//'))
		.join('\n');

/** The body of `canAttachImage`. */
const canAttachImageBody = () => {
	const start = messageInputSrc.indexOf('const canAttachImage = () => {');
	expect(start).toBeGreaterThan(-1);
	const end = messageInputSrc.indexOf('\n\t};', start);
	expect(end).toBeGreaterThan(start);
	return messageInputSrc.slice(start, end);
};

describe('self.chat#54: attaching to a model that cannot see', () => {
	it('still guards every one of the four attach paths', () => {
		// Drop/picker, both paste paths, screen capture. Making the refusal
		// conditional must not lose a check — an unguarded path would attach and
		// fail at the backend with the describer switched off.
		const checks = messageInputSrc.match(/canAttachImage\(\)/g) ?? [];
		expect(checks.length).toBe(4);
	});

	it('attaches and switches the describer on when it is available', () => {
		const body = canAttachImageBody();

		expect(body).toContain('describerAvailable($config, $_user)');
		expect(body).toContain('imageDescriberEnabled = true');
	});

	it('switches the describer on for a mixed vision and non-vision selection', () => {
		const body = canAttachImageBody();

		// Having one vision-capable model is not enough: the per-model send guard
		// still rejects any explicitly non-vision model unless the describer is
		// engaged.
		const allSelectedModelsAreAccepted =
			'selectedModelIds.length === visionCapableModels.length';
		const directSuccess = body.indexOf(allSelectedModelsAreAccepted);
		const describerCheck = body.indexOf('describerAvailable($config, $_user)');

		expect(directSuccess).toBeGreaterThan(-1);
		expect(describerCheck).toBeGreaterThan(directSuccess);
	});

	it('still refuses, with the same toast, when it is not', () => {
		const body = canAttachImageBody();

		expect(body).toContain("toast.error($i18n.t('Selected model(s) do not support image inputs'))");
		expect(body).toContain('return false;');

		// The refusal has to be the LAST word, not an earlier branch the
		// availability check falls through — otherwise an unavailable describer
		// attaches anyway.
		expect(body.lastIndexOf('return false;')).toBeGreaterThan(
			body.indexOf('describerAvailable($config, $_user)')
		);
	});

	it('makes the enable a user-action write, never an $effect that writes what it reads', () => {
		// self.chat#33: an $effect that writes a value it also reads kills the
		// whole route and presents as a dead UI. Auto-enable-on-attach is exactly
		// that shape if it is written as "watch files, set flag", so no $effect
		// anywhere in the composer may assign this flag.
		const effectsThatAssignIt = [...code(messageInputSrc).matchAll(/\$effect\(\(\) => \{/g)].filter(
			(match) => {
				const body = code(messageInputSrc).slice(
					match.index ?? 0,
					code(messageInputSrc).indexOf('\n\t});', match.index ?? 0)
				);
				return body.includes('imageDescriberEnabled =');
			}
		);

		expect(effectsThatAssignIt).toHaveLength(0);
	});

	it('announces itself in the same indicator strip as every other tool', () => {
		// "Not silently" is a requirement, not a nicety: a second model is about
		// to run. The strip's visibility condition has to include the flag, or the
		// whole strip stays hidden when the describer is the only thing on.
		const stripIdx = messageInputSrc.indexOf(
			'{#if atSelectedModel !== undefined || selectedToolIds.length > 0'
		);
		expect(stripIdx).toBeGreaterThan(-1);
		const stripCondition = messageInputSrc.slice(stripIdx, messageInputSrc.indexOf('}', stripIdx));
		expect(stripCondition).toContain('imageDescriberEnabled');

		expect(messageInputSrc).toContain('{#if imageDescriberEnabled}');
		expect(messageInputSrc).toContain("{$i18n.t('Describe images with a vision model')}");
	});

	it('does not show the "cannot see" warning and the describer at once', () => {
		expect(code(messageInputSrc)).toContain(
			'{#if selectedModelIds.length !== visionCapableModels.length && !imageDescriberEnabled}'
		);
	});

	it('lets the user switch it off like any other tool', () => {
		expect(inputMenuSrc).toContain('{#if describerAvailable($config, $user)}');
		expect(inputMenuSrc).toContain('imageDescriberEnabled = !imageDescriberEnabled;');
		expect(inputMenuSrc).toContain('<Switch state={imageDescriberEnabled} />');
	});

	it('binds the flag through every composer the chat renders', () => {
		// Two MessageInputs in Chat.svelte (the live composer and the one under
		// Placeholder), and the Placeholder pass-through between them. A missing
		// binding is a composer whose enable never reaches the send.
		expect((chatSrc.match(/bind:imageDescriberEnabled/g) ?? []).length).toBe(2);
		expect(placeholderSrc).toContain('bind:imageDescriberEnabled');
		expect(messageInputSrc).toContain('bind:imageDescriberEnabled');
	});
});

describe('self.chat#54: the send path', () => {
	it('lets the per-model guard through only when the describer is engaged', () => {
		expect(chatSrc).toContain(
			'if (hasImages && blocksImageInput(model) && !describerEngaged) {'
		);
	});

	it('re-checks availability rather than trusting the restored flag', () => {
		// A draft restored from localStorage can carry a stale `true` from a
		// session where the feature was configured, or from a user who has since
		// lost the permission. Trusting it would send an image the server refuses.
		expect(chatSrc).toContain(
			'let describerEngaged = $derived(imageDescriberEnabled && describerAvailable($config, $user));'
		);
	});

	it('puts the engaged value on the wire under the shared flag name', () => {
		const featuresIdx = chatSrc.indexOf('features: {');
		expect(featuresIdx).toBeGreaterThan(-1);
		const features = chatSrc.slice(featuresIdx, chatSrc.indexOf('},', featuresIdx));

		// A computed key, so #142's name lands in one file rather than here.
		expect(features).toContain('[DESCRIBER_FEATURE_FLAG]: describerEngaged');
		expect(features).not.toContain(`${DESCRIBER_FEATURE_FLAG}:`);
	});

	it('sends no per-request model override at all', () => {
		// self.chat#54 ships no override UI, and #142 refuses an unauthorised
		// override with a 401 rather than falling back to the default. So the
		// correct client behaviour today is to send nothing — and whoever adds an
		// override picker has to trip this test and decide about the refusal
		// deliberately, rather than quietly dropping it (self.ai#35's substitution
		// failure) or quietly sending it.
		expect(chatSrc).not.toContain(DESCRIBER_MODEL_FIELD);
		expect(chatSrc).not.toContain('DESCRIBER_MODEL_FIELD');
	});

	it('needs no per-action status rendering for the describe', () => {
		// #142 emits statusHistory events under action "image_input_describer"
		// with a plain `description`. ResponseMessage's generic branch already
		// renders an unrecognised action's description, shimmering while
		// `done: false` -- which is exactly what tells "describing" apart from
		// "stalled" (self.chat#52). Nothing to add; this pins the fallback so a
		// later refactor cannot quietly delete it.
		const responseSrc = read('src/lib/components/chat/Messages/ResponseMessage.svelte');
		const fallbackIdx = responseSrc.lastIndexOf('{:else}');
		expect(fallbackIdx).toBeGreaterThan(-1);
		expect(responseSrc).toContain("status?.done === false");
		expect(responseSrc).toContain('{status?.description}');
	});

	it('resets the flag when the chat does, and restores it with the draft', () => {
		// Left set across a chat switch it would silently engage a second model in
		// a conversation the user never enabled it for.
		expect((chatSrc.match(/imageDescriberEnabled = false;/g) ?? []).length).toBe(2);
		expect(
			(chatSrc.match(/imageDescriberEnabled = input\.imageDescriberEnabled \?\? false;/g) ?? [])
				.length
		).toBe(2);
		expect(messageInputSrc).toContain('imageDescriberEnabled\n\t\t});');
	});
});
