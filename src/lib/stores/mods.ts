import { type Writable, writable } from 'svelte/store';
import type { ModRegistryEntry } from '$lib/apis/mods';

// The enabled-mods registry response (client R1). Populated at app boot from
// `GET /api/v1/mods/enabled` and read by the sidebar's registry-driven nav.
// It holds exactly what the server returned — already scope-filtered — so the
// nav adds no gating of its own.
export const enabledMods: Writable<ModRegistryEntry[]> = writable([]);
