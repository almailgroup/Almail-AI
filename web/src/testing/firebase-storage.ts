/** Build-time stand-in for firebase/storage. Aliased only when E2E_STUB=1. */
export function getStorage() { return { __stub: true }; }
export function ref(_s: unknown, path: string) { return { path }; }
export async function uploadBytes() { return { metadata: {} }; }
export async function getDownloadURL(r: { path: string }) {
  return `https://stub.local/${encodeURIComponent(r.path)}`;
}
