// Public store surface, re-exported from per-domain modules.
//
// This file intentionally stays a thin barrel: it's imported from ~100+
// files across the app (routes, components), so it re-exports rather than
// forcing every call site onto per-module paths. Add new state to the
// domain module it belongs to, then re-export it here.
export * from './auth';
export * from './backend';
export * from './chat';
export * from './models';
export * from './settings';
export * from './socket';
export * from './ui';
export * from './workspace';
