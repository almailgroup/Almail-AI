/**
 * Build-time stand-in for firebase/firestore. Aliased only when E2E_STUB=1.
 * In-memory, with live listeners, so the real hooks run unmodified.
 */
type Row = Record<string, unknown>;
const store = new Map<string, Map<string, Row>>();
const listeners = new Map<string, Set<() => void>>();
let seq = 0;

const SERVER_TS = Symbol("serverTimestamp");
export function serverTimestamp() { return SERVER_TS; }

const mkTs = (ms: number) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toMillis: () => ms, toDate: () => new Date(ms) });
const resolve = (data: Row): Row =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === SERVER_TS ? mkTs(Date.now()) : v]));

const col = (path: string) => { let m = store.get(path); if (!m) { m = new Map(); store.set(path, m); } return m; };
/** Firestore accepts "a/b/c" in one segment, so flatten before splitting. */
const segments = (parts: string[]) => parts.join("/").split("/").filter(Boolean);
const notify = (path: string) => listeners.get(path)?.forEach((fn) => fn());

export function getFirestore() { return { __stub: true }; }
export function collection(_db: unknown, ...segs: string[]) { return { __col: true, path: segments(segs).join("/") }; }
export function doc(a: { __col?: boolean; path?: string } | unknown, ...rest: string[]) {
  const asCol = a as { __col?: boolean; path?: string };
  if (asCol?.__col) return { __doc: true, col: asCol.path as string, id: rest[0] ?? `auto${++seq}` };
  const segs = segments(rest);
  const id = segs.pop() as string;
  return { __doc: true, col: segs.join("/"), id };
}
export function where(field: string, op: string, value: unknown) { return { __where: true, field, op, value }; }
export function query(c: { path: string }, ...cs: unknown[]) {
  return { __query: true, col: c.path, wheres: cs.filter((x) => (x as { __where?: boolean })?.__where) as Array<{ field: string; op: string; value: unknown }> };
}

function snapDoc(colPath: string, id: string, data: Row) {
  return { id, exists: () => true, data: () => data, ref: { __doc: true, col: colPath, id } };
}
function readAll(colPath: string, wheres: Array<{ field: string; op: string; value: unknown }> = []) {
  let docs = [...col(colPath).entries()].map(([id, data]) => snapDoc(colPath, id, data));
  for (const w of wheres) docs = docs.filter((d) => (w.op === "==" ? d.data()[w.field] === w.value : true));
  return { docs, size: docs.length, empty: !docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) };
}

export async function addDoc(c: { path: string }, data: Row) {
  const id = `d${++seq}`;
  col(c.path).set(id, resolve(data));
  notify(c.path);
  return { __doc: true, col: c.path, id };
}
export async function setDoc(ref: { col: string; id: string }, data: Row, opts?: { merge?: boolean }) {
  const m = col(ref.col);
  m.set(ref.id, { ...(opts?.merge ? m.get(ref.id) ?? {} : {}), ...resolve(data) });
  notify(ref.col);
}
export async function updateDoc(ref: { col: string; id: string }, data: Row) {
  const m = col(ref.col);
  m.set(ref.id, { ...(m.get(ref.id) ?? {}), ...resolve(data) });
  notify(ref.col);
}
export async function deleteDoc(ref: { col: string; id: string }) { col(ref.col).delete(ref.id); notify(ref.col); }
export async function getDocs(q: { __query?: boolean; col?: string; path?: string; wheres?: Array<{ field: string; op: string; value: unknown }> }) {
  return q.__query ? readAll(q.col as string, q.wheres) : readAll(q.path as string);
}
export function onSnapshot(
  target: { __query?: boolean; col?: string; path?: string; wheres?: Array<{ field: string; op: string; value: unknown }> },
  cb: (snap: ReturnType<typeof readAll>) => void,
) {
  const path = (target.__query ? target.col : target.path) as string;
  const wheres = target.__query ? target.wheres ?? [] : [];
  const fire = () => cb(readAll(path, wheres));
  if (!listeners.has(path)) listeners.set(path, new Set());
  listeners.get(path)!.add(fire);
  queueMicrotask(fire);
  return () => { listeners.get(path)!.delete(fire); };
}
export function writeBatch() {
  const ops: Array<() => void> = [];
  return {
    delete(ref: { col: string; id: string }) { ops.push(() => { col(ref.col).delete(ref.id); notify(ref.col); }); },
    set(ref: { col: string; id: string }, data: Row) { ops.push(() => { col(ref.col).set(ref.id, resolve(data)); notify(ref.col); }); },
    async commit() { ops.forEach((fn) => fn()); },
  };
}
