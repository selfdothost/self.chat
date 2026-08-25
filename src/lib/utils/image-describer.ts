// The image-to-text describer, client side (self.chat#54).
//
// When a user attaches an image to a model that cannot see, a configured vision
// model describes it and the description is injected as text so the target
// model can answer. The describe itself, the config storage and the permissions
// all live in self.ai#142; this module is the client's view of them, and the
// one place the client's half of the policy is decided.
//
// ---------------------------------------------------------------------------
// CONTRACT — published by self.ai#142 and implemented there in !470
// ---------------------------------------------------------------------------
//
// Everything shares one stem, `image_input_describer`:
//
//   admin config     GET/POST /api/v1/images/config
//                    -> { "input": { "describer": { "enabled", "model" } } }
//                    (ENABLE_IMAGE_INPUT_DESCRIBER / IMAGE_INPUT_DESCRIBER_MODEL)
//
//   public config    /api/config -> features.enable_image_input_describer
//
//   permissions      features.image_input_describer           (use the tool)
//                    features.image_input_describer_override  (choose a model)
//
//   chat payload     features.image_input_describer   (bool)
//                    image_input_describer_model      (top-level, not in features)
//
//   status events    statusHistory action "image_input_describer"
//
// Two things about that contract are load-bearing enough to restate:
//
// 1. `features.enable_image_input_describer` is ALREADY `enabled AND a
//    non-empty model` — the server computes it that way precisely so an
//    enabled-but-unconfigured instance does not offer the toggle. This module
//    consumes it as given and does NOT re-derive that condition; two copies of
//    the same rule are two things that drift.
//
// 2. The override is REFUSED, never ignored. Sending
//    `image_input_describer_model` without
//    `features.image_input_describer_override` is a 401, and so is sending it
//    while holding only the override permission — the base grant is a
//    precondition the server enforces regardless of the group blob. So a client
//    that quietly drops an unauthorised override, or quietly falls back to the
//    instance default, would disagree with the server about which model ran.
//    That is the substitution failure self.ai#35 exists to prevent.
//
//    self.chat#54 ships NO per-request override UI — the composer never sends
//    `image_input_describer_model`, so there is nothing to drop today (asserted
//    in describer-auto-enable.test.ts). `userMayOverrideDescriberModel()` and
//    `DESCRIBER_MODEL_FIELD` exist so that whoever adds one has the permission
//    rule and the field name already stated, and has to decide about the
//    refusal deliberately rather than by omission.

import type { Model } from '$lib/stores/models';
import type { Config } from '$lib/stores/backend';
import type { SessionUser } from '$lib/stores/auth';

import { visionSupport } from './model-capabilities';

/** Top-level key holding input-side settings in the images ADMIN config,
 *  beside `openai`/`comfyui`/`automatic1111`. */
export const DESCRIBER_ADMIN_CONFIG_KEY = 'input';

/** The describer's own object inside that key. Nested, not flat: `input` is the
 *  namespace for input-side image settings generally, and the describer is one
 *  of them. */
export const DESCRIBER_ADMIN_CONFIG_SUBKEY = 'describer';

/** Flag name inside the chat payload's `features` object, beside `web_search`,
 *  `deep_research` and `web_crawl`. */
export const DESCRIBER_FEATURE_FLAG = 'image_input_describer';

/** Per-request model override. A TOP-LEVEL body field, not a member of
 *  `features` — the same shape as `web_crawl_kb_id`, allowlisted into metadata
 *  server-side. Unused by this client; see the header. */
export const DESCRIBER_MODEL_FIELD = 'image_input_describer_model';

/** `statusHistory` action the describe reports under. ResponseMessage's generic
 *  branch already renders an unrecognised action's `description` (with the
 *  shimmer while `done: false`), which is exactly what these events need, so
 *  there is no per-action rendering to add. */
export const DESCRIBER_STATUS_ACTION = 'image_input_describer';

// ---------------------------------------------------------------------------

/** The describer half of the images admin config. */
export interface DescriberSettings {
	/** Is the input describer switched on instance-wide. */
	enabled: boolean;
	/** Id of the instance-default vision model. `''` means unconfigured. */
	model: string;
}

export const emptyDescriberSettings = (): DescriberSettings => ({ enabled: false, model: '' });

/**
 * Pull the describer settings out of whatever the images admin config returned.
 *
 * Tolerant of an absent or half-formed `input.describer`, so the admin form is
 * bindable rather than crashing on `undefined.enabled`.
 */
export const readAdminDescriberSettings = (
	adminConfig: Record<string, unknown> | null | undefined
): DescriberSettings => {
	const input = (adminConfig?.[DESCRIBER_ADMIN_CONFIG_KEY] ?? {}) as Record<string, unknown>;
	const stored = (input?.[DESCRIBER_ADMIN_CONFIG_SUBKEY] ?? {}) as Partial<DescriberSettings>;

	return {
		enabled: stored.enabled === true,
		model: typeof stored.model === 'string' ? stored.model : ''
	};
};

/**
 * The images admin config as it goes on the wire, with the describer folded in.
 *
 * Written as a merge rather than an overwrite: `input` is a namespace that may
 * grow other input-side settings, and clobbering its siblings on every save
 * would be a silent data loss the moment it does.
 */
export const adminConfigWithDescriber = (
	adminConfig: Record<string, unknown> | null | undefined,
	settings: DescriberSettings
): Record<string, unknown> => {
	const input = (adminConfig?.[DESCRIBER_ADMIN_CONFIG_KEY] ?? {}) as Record<string, unknown>;

	return {
		...(adminConfig ?? {}),
		[DESCRIBER_ADMIN_CONFIG_KEY]: {
			...input,
			[DESCRIBER_ADMIN_CONFIG_SUBKEY]: { enabled: settings.enabled, model: settings.model }
		}
	};
};

/**
 * Whether this user may have images described.
 *
 * Absent means denied. The server default for the base grant is False in
 * `config.py` (the manifest raises it to True on this deployment), and a client
 * that guessed permissive would attach an image the server then refuses —
 * the attach-then-fail shape self.chat#51 removed. Admins are not subject to
 * the feature permissions, the same exemption ModelSelector and ResponseMessage
 * already make.
 */
export const userMayUseDescriber = (user: SessionUser | undefined | null): boolean => {
	if (user?.role === 'admin') {
		return true;
	}

	return user?.permissions?.features?.image_input_describer === true;
};

/**
 * Whether this user may name a vision model other than the instance default.
 *
 * The base grant is a PRECONDITION: #142 refuses an override held without it,
 * regardless of what the group blob says, so holding only the override
 * permission is not permission. Modelled here rather than at a call site so the
 * client cannot offer an override it knows the server will 401.
 *
 * Nothing in self.chat#54 calls this yet — see the header.
 */
export const userMayOverrideDescriberModel = (user: SessionUser | undefined | null): boolean => {
	if (!userMayUseDescriber(user)) {
		return false;
	}
	if (user?.role === 'admin') {
		return true;
	}

	return user?.permissions?.features?.image_input_describer_override === true;
};

/**
 * The one question the composer asks: can an image attached to a model that
 * cannot see actually be handled?
 *
 * `enable_image_input_describer` already means "switched on AND a default model
 * is set" — see the header. Re-checking the model here would duplicate a rule
 * the server owns, so this is the published flag plus the permission, and
 * nothing else.
 */
export const describerAvailable = (
	config: Config | undefined | null,
	user: SessionUser | undefined | null
): boolean => config?.features?.enable_image_input_describer === true && userMayUseDescriber(user);

/**
 * The models an admin may pick as the instance default: the ones that can
 * actually see.
 *
 * `'supported'` only — an *unknown* capability is not a basis for making
 * something the describer, even though it is a basis for permitting a send
 * (see $lib/utils/model-capabilities for why those two differ). Arena entries
 * are pseudo-models, not something that can be called to describe.
 */
export const modelsThatCanSee = (models: Model[] | undefined | null): Model[] =>
	(models ?? []).filter(
		(model) => model.owned_by !== 'arena' && visionSupport(model) === 'supported'
	);
