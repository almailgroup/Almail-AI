/** Build-time stand-in for firebase/app. Aliased only when E2E_STUB=1. */
export function initializeApp(options: unknown) { return { options, name: "[DEFAULT]" }; }
export function getApp() { return { options: {}, name: "[DEFAULT]" }; }
export function getApps() { return []; }
