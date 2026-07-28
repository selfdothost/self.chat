// Minimal $app/paths mock for Vitest component tests. SvelteKit's `resolve`
// turns a route id into a path; returning the input is sufficient under jsdom.
export const base = '';
export const assets = '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolve(id: string, _params?: any): string {
	return id;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveRoute(id: string, _params?: any): string {
	return id;
}
