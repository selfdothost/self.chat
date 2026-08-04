// nodeCatalog.ts — the pluggable node-type catalog for the Sound Studio
// pipeline canvas (Sound Studio Phase 1, T-011).
//
// The canvas (`SoundPipelineCanvas.svelte`) is deliberately catalog-driven: it
// knows nothing about *what* node types exist, only how to render any
// descriptor generically (ports from `inputs`/`outputs`, a body from `fields`
// or an optional custom `body` component). Phase 2 swaps the voice vocabulary
// in here — new descriptors in this file, or a different catalog passed via the
// canvas's optional `catalog` prop — with **no change to the canvas itself**.
//
// This ships the PLACEHOLDER catalog: three generic shapes (`source`,
// `transform`, `sink`) that exercise every part of the generic renderer
// (0/1 inputs, 0/1 outputs, a mix of field types).

import type { Component } from 'svelte';

/**
 * A connection point on a node. `id` becomes the xyflow Handle id. `dataType`
 * is a small type tag ('ref_audio' | 'voice' | …) so the canvas can reject
 * nonsensical wires (an output only connects to an input of the same dataType).
 * Omit it for untyped/wildcard ports.
 */
export type PortSpec = {
	id: string;
	label?: string;
	dataType?: string;
};

/** A single editable field rendered generically in a node body. */
export type FieldSpec = {
	key: string;
	label: string;
	type: 'text' | 'number' | 'select' | 'checkbox';
	/** Static options for `type: 'select'`. */
	options?: Array<{ label: string; value: string }>;
	/**
	 * For `type: 'select'`: pull options at render time from a runtime source the
	 * canvas provides via context, instead of the static `options` above. Only
	 * 'samples' (this voice's uploaded sample files) is defined today — it lets a
	 * Voice Sample node bind to a real uploaded clip so the blend knows which file.
	 */
	optionsKey?: 'samples';
	placeholder?: string;
	default?: unknown;
};

/**
 * Context key: the canvas provides the voice's uploaded sample files as
 * `{ label, value }[]` (value = file id) so a `select` field with
 * `optionsKey: 'samples'` can render a real picker. Empty/absent on the stub
 * canvas (no voice).
 */
export const SAMPLES_CONTEXT_KEY = Symbol('sound-pipeline-samples');

/**
 * Props a custom `body` component receives, if a descriptor supplies one
 * instead of a declarative `fields` list. It is handed the node's current
 * field values and a patch callback to persist edits.
 */
export type NodeBodyProps = {
	values: Record<string, unknown>;
	onchange: (patch: Record<string, unknown>) => void;
};

/** A pluggable node-type descriptor. The canvas renders any of these. */
export type NodeTypeDescriptor = {
	/** Stable machine key; also the xyflow `node.type`. */
	type: string;
	label: string;
	description?: string;
	/**
	 * Accent color for the node header. Any CSS color string; the generic node
	 * renders it as a left-border / header tint so it needs no Tailwind class.
	 */
	accent?: string;
	/** Input ports (targets). Empty ⇒ a pure source. */
	inputs: PortSpec[];
	/** Output ports (sources). Empty ⇒ a terminal sink. */
	outputs: PortSpec[];
	/** Declarative fields rendered generically. Ignored if `body` is set. */
	fields?: FieldSpec[];
	/** Optional custom body component; overrides `fields` when present. */
	body?: Component<NodeBodyProps>;
};

/** A catalog is a map of node-type key → descriptor. */
export type NodeCatalog = Record<string, NodeTypeDescriptor>;

/**
 * PLACEHOLDER catalog — generic shapes only. Phase 2 replaces these entries
 * with the voice vocabulary (e.g. `voice-source`, `pitch-shift`, `tts-sink`)
 * and the canvas renders them without modification.
 */
export const placeholderCatalog: NodeCatalog = {
	source: {
		type: 'source',
		label: 'Source',
		description: 'Produces data into the pipeline.',
		accent: '#059669', // emerald-600
		inputs: [],
		outputs: [{ id: 'out', label: 'out' }],
		fields: [{ key: 'name', label: 'Name', type: 'text', placeholder: 'source name', default: '' }]
	},
	transform: {
		type: 'transform',
		label: 'Transform',
		description: 'Transforms data flowing through.',
		accent: '#4f46e5', // indigo-600
		inputs: [{ id: 'in', label: 'in' }],
		outputs: [{ id: 'out', label: 'out' }],
		fields: [
			{ key: 'name', label: 'Name', type: 'text', placeholder: 'transform name', default: '' },
			{
				key: 'mode',
				label: 'Mode',
				type: 'select',
				options: [
					{ label: 'Passthrough', value: 'passthrough' },
					{ label: 'Map', value: 'map' },
					{ label: 'Filter', value: 'filter' }
				],
				default: 'passthrough'
			}
		]
	},
	sink: {
		type: 'sink',
		label: 'Sink',
		description: 'Consumes data at the end of the pipeline.',
		accent: '#e11d48', // rose-600
		inputs: [{ id: 'in', label: 'in' }],
		outputs: [],
		fields: [{ key: 'name', label: 'Name', type: 'text', placeholder: 'sink name', default: '' }]
	}
};

/**
 * VOICE catalog — Sound Studio Phase 2, the real voice-building vocabulary.
 * The VOICE WORKSHOP node vocabulary. A sound engineer builds a NEW character
 * voice by wiring one or more sample(s) → a Shape step (work the levers) → preview
 * / save. This is NOT "voice cloning" — cloning a sample is one of several ways to
 * *seed* a voice, not the intent. Ports are typed (`ref_audio`, `voice`) so the
 * canvas only allows sensible connections. Nodes are wired to STUBS in Phase 2;
 * the live engines (Chatterbox seed/preview, GPT-SoVITS deepen, self.speak
 * preview) land in Phase 3.
 *
 * `type` keys stay stable (graph-schema identifiers); the framing lives in the
 * labels/descriptions/fields the artist actually sees.
 */
export const voiceCatalog: NodeCatalog = {
	'reference-audio': {
		type: 'reference-audio',
		label: 'Voice Sample',
		description:
			"A sample to draw from — pick from this voice's Files. One of several ways to begin a voice; add more than one to combine material. Attest you have the rights to use it.",
		accent: '#0891b2', // cyan-600
		inputs: [],
		outputs: [{ id: 'audio', label: 'audio', dataType: 'ref_audio' }],
		// Binds to one of the voice's uploaded sample files (options injected by the
		// canvas via SAMPLES_CONTEXT_KEY). This is what lets a blend know which clip
		// each Voice Sample node contributes. Rights are attested here.
		fields: [
			{ key: 'file', label: 'Sample file', type: 'select', optionsKey: 'samples', default: '' },
			{ key: 'consent', label: 'Rights attested', type: 'checkbox', default: false }
		]
	},
	clone: {
		type: 'clone',
		label: 'Shape Voice',
		description:
			"Seed a character voice from your sample(s) and work the levers to make it yours. (Seeds instantly from the sample's timbre via Chatterbox; accents, effects and other techniques land as more ways to shape.)",
		accent: '#7c3aed', // violet-600
		inputs: [{ id: 'ref', label: 'sample(s)', dataType: 'ref_audio' }],
		outputs: [{ id: 'voice', label: 'voice', dataType: 'voice' }],
		// The levers — Chatterbox's generate controls, in artist language.
		fields: [
			{
				key: 'exaggeration',
				label: 'Expressiveness',
				type: 'number',
				placeholder: '0.0–1.0 (flat ↔ theatrical)',
				default: 0.5
			},
			{
				key: 'cfg_weight',
				label: 'Character',
				type: 'number',
				placeholder: '0.0–1.0 (loose ↔ tight to the sample)',
				default: 0.5
			},
			{
				key: 'blend',
				label: 'Blend',
				type: 'number',
				// Only takes effect with TWO Voice Sample nodes wired in: 0 = all the
				// first sample's voice, 1 = all the second's, between = interpolated.
				placeholder: '0.0–1.0 (first sample ↔ second sample)',
				default: 0.5
			}
		]
	},
	'fine-tune': {
		type: 'fine-tune',
		label: 'Deepen (train)',
		description: 'Train the voice on ~1 min of audio for a stronger, more consistent character (GPT-SoVITS). Uses a GPU window.',
		accent: '#4f46e5', // indigo-600
		inputs: [{ id: 'ref', label: 'sample(s)', dataType: 'ref_audio' }],
		outputs: [{ id: 'voice', label: 'voice', dataType: 'voice' }],
		fields: [{ key: 'epochs', label: 'Epochs', type: 'number', placeholder: 'e.g. 10', default: 10 }]
	},
	preview: {
		type: 'preview',
		label: 'Preview',
		description: 'Type a line and hear the voice (self.speak). Later: drive this from a character-dialogue model instead of typing.',
		accent: '#059669', // emerald-600
		inputs: [{ id: 'voice', label: 'voice', dataType: 'voice' }],
		outputs: [],
		fields: [{ key: 'text', label: 'Text', type: 'text', placeholder: 'Type a line to hear…', default: '' }]
	},
	'save-as-voice': {
		type: 'save-as-voice',
		label: 'Save Voice',
		description: 'Save this custom voice so it can be used in chat and beyond.',
		accent: '#e11d48', // rose-600
		inputs: [{ id: 'voice', label: 'voice', dataType: 'voice' }],
		outputs: [],
		fields: []
	}
};

/** The catalog the canvas uses by default (overridable via its `catalog` prop). */
export const nodeCatalog: NodeCatalog = voiceCatalog;

/** Svelte context key under which the active catalog is provided to nodes. */
export const CATALOG_CONTEXT_KEY = Symbol('sound-pipeline-node-catalog');

/**
 * Context key for the Preview action. SoundPipelineCanvas provides a
 * `(nodeId: string, text: string) => Promise<void>` that resolves the crafted
 * voice's levers from the graph, calls the connector, and plays the audio. The
 * Preview node's Play button calls it. Provided only when the canvas has a
 * `voiceId` (i.e. building a real, saved voice — Phase 3 wiring).
 */
export const PREVIEW_CONTEXT_KEY = Symbol('sound-pipeline-preview');

/** Build the initial field-value bag for a freshly-added node of `type`. */
export function defaultValuesFor(descriptor: NodeTypeDescriptor): Record<string, unknown> {
	const values: Record<string, unknown> = {};
	for (const field of descriptor.fields ?? []) {
		if (field.default !== undefined) values[field.key] = field.default;
	}
	return values;
}
