// RFC 4122 version 4 UUID generator with graceful fallback.
//
// `crypto.randomUUID()` is only available in *secure contexts* (HTTPS or
// `localhost`). Plain HTTP on a LAN IP — our typical self-hosted / offline
// deployment — does NOT count as a secure context, so calling
// `crypto.randomUUID()` there throws `TypeError: crypto.randomUUID is not a
// function` and blanks the page that tried to use it.
//
// This module picks the best UUID source available at call time:
//   1. `crypto.randomUUID()` when present (HTTPS / localhost).
//   2. `crypto.getRandomValues()` + manual v4 formatting when the WebCrypto
//      API exists but `randomUUID` does not.
//   3. `Math.random()` as a last-resort fallback. Not cryptographically
//      strong, but good enough for the UI-local ids we use it for (React
//      keys, drag handles, temporary row ids before server insert).

type Crypto = typeof globalThis extends { crypto: infer C } ? C : never;

function getCrypto(): Crypto | undefined {
  if (typeof globalThis === "undefined") return undefined;
  return (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
}

function uuidFromRandomBytes(bytes: Uint8Array): string {
  // Per RFC 4122 §4.4: set the version (4) and variant (10xx) bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push(bytes[i].toString(16).padStart(2, "0"));
  }
  return (
    hex.slice(0, 4).join("") + "-" +
    hex.slice(4, 6).join("") + "-" +
    hex.slice(6, 8).join("") + "-" +
    hex.slice(8, 10).join("") + "-" +
    hex.slice(10, 16).join("")
  );
}

export function randomUUID(): string {
  const c = getCrypto();

  if (c && typeof c.randomUUID === "function") {
    try {
      return c.randomUUID();
    } catch {
      // Some browsers throw here in non-secure contexts even though the
      // function exists — fall through to getRandomValues.
    }
  }

  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return uuidFromRandomBytes(bytes);
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return uuidFromRandomBytes(bytes);
}
