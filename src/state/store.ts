// store.ts — the ONLY place in this repo that is allowed to touch localStorage.
//
// WHY THIS MODULE EXISTS (do not inline a localStorage.getItem later):
//
// In production, gleameil.github.io/in, /out and /house are the same origin —
// scheme, host and port all match, and the path is irrelevant to the storage
// partition. localStorage is therefore ALREADY shared between the three sites
// and no transport layer is needed.
//
// In local development they are three Parcel servers on three ports. Different
// port means different origin means three separate, silently unconnected
// localStorages. Cross-site sharing simply stops working, and it stops working
// quietly — you get empty arrays, not errors. (BroadcastChannel does not help:
// it is origin-scoped too.)
//
// So every cross-site read goes through readShared(), which in dev falls back
// to a fixture representing "a player who has already been through the house".
// One module, one place to swap the shim. If feature code calls localStorage
// directly, that fallback does not exist for it and the dev build lies.

import {
  NAMESPACE_PREFIX,
  SCHEMA_VERSION,
  STORAGE_KEYS,
} from './state.constants';

// --------------------------------------------------------------- backend ---

export interface StorageBackend {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
  /** every key currently held, so clearNamespace can filter */
  keys(): string[];
}

/** Real web storage, wrapped so a disabled/full/private-mode store degrades to
 *  memory for the session instead of throwing on page load. */
function webStorageBackend(): StorageBackend {
  return {
    read(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    write(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        memoryFallback.write(key, value);
      }
    },
    remove(key) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        memoryFallback.remove(key);
      }
    },
    keys() {
      try {
        const out: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k !== null) out.push(k);
        }
        return out;
      } catch {
        return memoryFallback.keys();
      }
    },
  };
}

export function memoryBackend(seed: Record<string, string> = {}): StorageBackend {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    read: (key) => map.get(key) ?? null,
    write: (key, value) => void map.set(key, value),
    remove: (key) => void map.delete(key),
    keys: () => [...map.keys()],
  };
}

const memoryFallback = memoryBackend();

/** True when this is a local Parcel server rather than the deployed site.
 *  Deliberately hostname-based: the three dev servers differ by port, so a
 *  port check alone would also have to know which ports are "ours". */
export function isDevOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

/** The dev shim. Reads hit the real (per-port) store first, so anything this
 *  site wrote in this session is still authoritative; only a genuine ABSENCE
 *  falls through to the fixture. Writes always go to the real store. That way
 *  dev behaves like production for everything you actually do, and only fills
 *  in the part production would have had from a sibling site. */
function devSharedBackend(real: StorageBackend, fixture: StorageBackend): StorageBackend {
  return {
    read: (key) => real.read(key) ?? fixture.read(key),
    write: (key, value) => real.write(key, value),
    remove: (key) => real.remove(key),
    keys: () => [...new Set([...real.keys(), ...fixture.keys()])],
  };
}

/** What a dev build pretends a sibling site left behind. Small on purpose —
 *  enough for /in/ to have something to render, not a full playthrough. */
export const DEV_FIXTURE: Record<string, string> = {
  [STORAGE_KEYS.sharedDolls]: JSON.stringify(['ragged', 'curly']),
  [STORAGE_KEYS.sharedKeys]: JSON.stringify(['key1', 'key4', 'key9']),
  [STORAGE_KEYS.sound]: JSON.stringify('on'),
};

let sharedBackend: StorageBackend | null = null;
let localBackend: StorageBackend | null = null;

function shared(): StorageBackend {
  if (sharedBackend === null) {
    const real = typeof window === 'undefined' ? memoryFallback : webStorageBackend();
    sharedBackend = isDevOrigin()
      ? devSharedBackend(real, memoryBackend(DEV_FIXTURE))
      : real;
  }
  return sharedBackend;
}

function local(): StorageBackend {
  if (localBackend === null) {
    localBackend = typeof window === 'undefined' ? memoryFallback : webStorageBackend();
  }
  return localBackend;
}

/** Test seam. Pass nothing to restore the real backends. */
export function setBackends(next?: { shared?: StorageBackend; local?: StorageBackend }): void {
  sharedBackend = next?.shared ?? null;
  localBackend = next?.local ?? null;
}

// ------------------------------------------------------------ read/write ---

function assertNamespaced(key: string): void {
  if (!key.startsWith(NAMESPACE_PREFIX)) {
    throw new Error(
      `Storage key "${key}" is not namespaced. All new keys begin with ` +
        `"${NAMESPACE_PREFIX}" (00-CONTRACTS.md §1). Legacy unprefixed /in/ ` +
        `keys are not ours to read or write from here.`,
    );
  }
}

function decode<T>(raw: string | null, fallback: T, key: string): T {
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    // Corrupt values are left in place rather than deleted: a returning player
    // is better served by a working game plus recoverable garbage than by a
    // store that quietly eats what it cannot read.
    console.warn(`[evernost] unreadable value at ${key}; using default`);
    return fallback;
  }
}

/** Read a value another site may also read. Absence is not an error — it is
 *  the ordinary case for a player who has never opened the other site. */
export function readShared<T>(key: string, fallback: T): T {
  assertNamespaced(key);
  return decode(shared().read(key), fallback, key);
}

export function writeShared<T>(key: string, value: T): void {
  assertNamespaced(key);
  shared().write(key, JSON.stringify(value));
}

/** Read a value only the house reads. Same storage in production; skips the
 *  dev fixture, because there is no sibling site to pretend to be. */
export function readLocal<T>(key: string, fallback: T): T {
  assertNamespaced(key);
  return decode(local().read(key), fallback, key);
}

export function writeLocal<T>(key: string, value: T): void {
  assertNamespaced(key);
  local().write(key, JSON.stringify(value));
}

export function removeShared(key: string): void {
  assertNamespaced(key);
  shared().remove(key);
}

export function removeLocal(key: string): void {
  assertNamespaced(key);
  local().remove(key);
}

/** Append-only union write, for any array a second site also writes.
 *  `evernost:shared:keys` is the live example: the house places fifteen of the
 *  sixteen keys, but key13's "Found in" is /in/'s Jennie's room, so /in/ has to
 *  be able to add to the same array. Whole-array replacement would let
 *  whichever site wrote last erase the other's contribution. Always union.
 *  Returns the merged array. */
export function unionIntoShared(key: string, ids: string[]): string[] {
  const merged = [...new Set([...readShared<string[]>(key, []), ...ids])];
  writeShared(key, merged);
  return merged;
}

// ----------------------------------------------------------- schema ------

export type SchemaOutcome =
  /** nothing stored yet; version stamped */
  | 'fresh'
  /** stored version matches */
  | 'current'
  /** stored version was older; the evernost: namespace was wiped and restamped */
  | 'wiped'
  /** stored version is NEWER than this build knows */
  | 'future';

/** Removes every key in the evernost: namespace, and nothing else. The
 *  unprefixed /in/ keys (evernostianNow, darkRoomPath, showRainbow,
 *  jennies-room-bg, currentBrowserTabName, met*Ending, *ChapterIndex,
 *  *TextIndex, *-background-choice-february) are outside this namespace by
 *  construction and cannot be reached from here. That is the whole point of
 *  the prefix. */
export function clearNamespace(): void {
  for (const backend of [shared(), local()]) {
    for (const key of backend.keys()) {
      if (key.startsWith(NAMESPACE_PREFIX)) backend.remove(key);
    }
  }
}

/** Call once, before anything else reads state.
 *
 *  Policy, stated so it is a decision and not an accident:
 *
 *  - older stored version  → WIPE AND START OVER. Migration code for a game
 *    with no players yet is a liability, not a kindness. Revisit if the house
 *    ships publicly and someone has a save worth keeping.
 *  - newer stored version  → DO NOTHING and report 'future'. This is not
 *    hypothetical: the three sites deploy independently, so a player can
 *    easily reach an older /house/ build carrying state written by a newer
 *    /in/. Wiping there would mean the older build destroys the newer build's
 *    save on sight. Callers should degrade to treating shared state as absent.
 */
export function ensureSchema(): SchemaOutcome {
  const stored = readShared<number | null>(STORAGE_KEYS.schema, null);
  if (stored === null) {
    writeShared(STORAGE_KEYS.schema, SCHEMA_VERSION);
    return 'fresh';
  }
  if (stored === SCHEMA_VERSION) return 'current';
  if (stored > SCHEMA_VERSION) return 'future';
  clearNamespace();
  writeShared(STORAGE_KEYS.schema, SCHEMA_VERSION);
  return 'wiped';
}
