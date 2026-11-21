/**
 * bcrypt ($2a/$2y) with an explicit 22-character salt, matching jBCrypt's raw
 * output. Coolapk's X-App-Token needs it, and the plugin runtime only offers
 * sha256/md5, so the EksBlowfish setup lives here.
 */
import { utf8Bytes } from "./bytes";
import { P_INIT, S_INIT } from "./blowfish";

const ALPHABET = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function charCode(char: string): number {
  return ALPHABET.indexOf(char);
}

export function decodeBase64(text: string, maxLength: number): Uint8Array {
  const out = new Uint8Array(maxLength);
  let offset = 0;
  let produced = 0;
  while (offset < text.length - 1 && produced < maxLength) {
    const c1 = charCode(text[offset++]);
    const c2 = charCode(text[offset++]);
    if (c1 < 0 || c2 < 0) break;
    out[produced++] = ((c1 << 2) | ((c2 & 0x30) >> 4)) & 0xff;
    if (produced >= maxLength || offset >= text.length) break;
    const c3 = charCode(text[offset++]);
    if (c3 < 0) break;
    out[produced++] = (((c2 & 0x0f) << 4) | ((c3 & 0x3c) >> 2)) & 0xff;
    if (produced >= maxLength || offset >= text.length) break;
    const c4 = charCode(text[offset++]);
    if (c4 < 0) break;
    out[produced++] = (((c3 & 0x03) << 6) | c4) & 0xff;
  }
  return out.subarray(0, produced);
}

export function encodeBase64(data: Uint8Array, length: number): string {
  let out = "";
  let offset = 0;
  while (offset < length) {
    let c1 = data[offset++] & 0xff;
    out += ALPHABET[(c1 >> 2) & 0x3f];
    c1 = (c1 & 0x03) << 4;
    if (offset >= length) {
      out += ALPHABET[c1 & 0x3f];
      break;
    }
    let c2 = data[offset++] & 0xff;
    c1 |= (c2 >> 4) & 0x0f;
    out += ALPHABET[c1 & 0x3f];
    c1 = (c2 & 0x0f) << 2;
    if (offset >= length) {
      out += ALPHABET[c1 & 0x3f];
      break;
    }
    c2 = data[offset++] & 0xff;
    c1 |= (c2 >> 6) & 0x03;
    out += ALPHABET[c1 & 0x3f];
    out += ALPHABET[c2 & 0x3f];
  }
  return out;
}

/** Cyclically reads 32-bit big-endian words out of a byte buffer. */
function streamToWord(data: Uint8Array, cursor: { offset: number }): number {
  let word = 0;
  for (let i = 0; i < 4; i++) {
    word = ((word << 8) | data[cursor.offset]) >>> 0;
    cursor.offset = (cursor.offset + 1) % data.length;
  }
  return word;
}

interface State {
  p: Uint32Array;
  s: Uint32Array;
}

export function newState(): State {
  return { p: Uint32Array.from(P_INIT), s: Uint32Array.from(S_INIT) };
}

function f(state: State, x: number): number {
  const s = state.s;
  return (
    (((s[(x >>> 24) & 0xff] + s[0x100 | ((x >>> 16) & 0xff)]) >>> 0) ^
      s[0x200 | ((x >>> 8) & 0xff)]) +
    s[0x300 | (x & 0xff)]
  ) >>> 0;
}

export function encipher(state: State, block: Uint32Array): void {
  const { p } = state;
  let l = block[0];
  let r = block[1];
  for (let i = 0; i < 16; i++) {
    l ^= p[i];
    r ^= f(state, l);
    const swap = l;
    l = r;
    r = swap;
  }
  const swap = l;
  l = r;
  r = swap;
  r ^= p[16];
  l ^= p[17];
  block[0] = l >>> 0;
  block[1] = r >>> 0;
}

/** Key schedule without salt (used 2^cost times during setup). */
export function expandKey(state: State, key: Uint8Array): void {
  const { p, s } = state;
  const cursor = { offset: 0 };
  for (let i = 0; i < p.length; i++) p[i] = (p[i] ^ streamToWord(key, cursor)) >>> 0;
  const block = new Uint32Array(2);
  for (let i = 0; i < p.length; i += 2) {
    encipher(state, block);
    p[i] = block[0];
    p[i + 1] = block[1];
  }
  for (let i = 0; i < s.length; i += 2) {
    encipher(state, block);
    s[i] = block[0];
    s[i + 1] = block[1];
  }
}

/** Key schedule with salt XORed in before every enciphering (first setup step). */
export function expandKeySalted(state: State, salt: Uint8Array, key: Uint8Array): void {
  const { p, s } = state;
  const keyCursor = { offset: 0 };
  const saltCursor = { offset: 0 };
  for (let i = 0; i < p.length; i++) p[i] = (p[i] ^ streamToWord(key, keyCursor)) >>> 0;
  const block = new Uint32Array(2);
  for (let i = 0; i < p.length; i += 2) {
    block[0] = (block[0] ^ streamToWord(salt, saltCursor)) >>> 0;
    block[1] = (block[1] ^ streamToWord(salt, saltCursor)) >>> 0;
    encipher(state, block);
    p[i] = block[0];
    p[i + 1] = block[1];
  }
  for (let i = 0; i < s.length; i += 2) {
    block[0] = (block[0] ^ streamToWord(salt, saltCursor)) >>> 0;
    block[1] = (block[1] ^ streamToWord(salt, saltCursor)) >>> 0;
    encipher(state, block);
    s[i] = block[0];
    s[i + 1] = block[1];
  }
}

/** `$2a$<cost>$<salt>` → `$2a$<cost>$<salt><31-char hash>`, identically to jBCrypt. */
export function bcryptHash(password: string, cost: number, salt: string): string {
  // `$2a`/`$2y` append a trailing NUL to the password bytes.
  const key = utf8Bytes(`${password}\x00`);
  const saltBytes = decodeBase64(salt, 16);
  if (key.length === 0) throw new Error("bcrypt needs a password");
  if (saltBytes.length !== 16) throw new Error("bcrypt needs a 16-byte salt");

  const state = newState();
  expandKeySalted(state, saltBytes, key);
  const rounds = 1 << cost;
  for (let i = 0; i < rounds; i++) {
    expandKey(state, key);
    expandKey(state, saltBytes);
  }

  const cipher = utf8Bytes("OrpheanBeholderScryDoubt");
  const block = new Uint32Array(2);
  for (let round = 0; round < 64; round++) {
    for (let offset = 0; offset < cipher.length; offset += 8) {
      block[0] = (cipher[offset] << 24) | (cipher[offset + 1] << 16) | (cipher[offset + 2] << 8) | cipher[offset + 3];
      block[1] =
        (cipher[offset + 4] << 24) |
        (cipher[offset + 5] << 16) |
        (cipher[offset + 6] << 8) |
        cipher[offset + 7];
      encipher(state, block);
      cipher[offset] = (block[0] >>> 24) & 0xff;
      cipher[offset + 1] = (block[0] >>> 16) & 0xff;
      cipher[offset + 2] = (block[0] >>> 8) & 0xff;
      cipher[offset + 3] = block[0] & 0xff;
      cipher[offset + 4] = (block[1] >>> 24) & 0xff;
      cipher[offset + 5] = (block[1] >>> 16) & 0xff;
      cipher[offset + 6] = (block[1] >>> 8) & 0xff;
      cipher[offset + 7] = block[1] & 0xff;
    }
  }

  const costText = cost < 10 ? `0${cost}` : String(cost);
  return `$2a$${costText}$${encodeBase64(saltBytes, 16)}${encodeBase64(cipher, 23)}`;
}
