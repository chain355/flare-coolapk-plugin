/** Minimal byte/base64/UTF-8 helpers. The plugin runtime has no Buffer, atob or TextEncoder. */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** UTF-8 encode a string into bytes. Coolapk payloads are ASCII, but keep the general path correct. */
export function utf8Bytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return Uint8Array.from(out);
}

export function utf8Text(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    if (byte < 0x80) out += String.fromCharCode(byte);
    else if (byte < 0xe0) out += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++i] & 0x3f));
    else if (byte < 0xf0) {
      out += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    } else {
      const code = ((byte & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
      out += String.fromCharCode(0xd800 + ((code - 0x10000) >> 10), 0xdc00 + ((code - 0x10000) & 0x3ff));
    }
  }
  return out;
}

export function base64Encode(text: string): string {
  const bytes = utf8Bytes(text);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : -1;
    const c = i + 2 < bytes.length ? bytes[i + 2] : -1;
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | (b === -1 ? 0 : b >> 4)];
    out += b === -1 ? "=" : B64[((b & 0x0f) << 2) | (c === -1 ? 0 : c >> 6)];
    out += c === -1 ? "=" : B64[c & 0x3f];
  }
  return out;
}

export function base64NoPadding(text: string): string {
  return base64Encode(text).replace(/=+$/, "");
}

export function base64DecodeBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    bytes.push(((a << 2) | (b >> 4)) & 0xff);
    if (c !== -1) bytes.push((((b & 0x0f) << 4) | (c >> 2)) & 0xff);
    if (d !== -1) bytes.push((((c & 0x03) << 6) | d) & 0xff);
  }
  return Uint8Array.from(bytes);
}

export function base64DecodeText(text: string): string {
  return utf8Text(base64DecodeBytes(text));
}
