// RFC 6238 TOTP (SHA-1, 30s steps, 6 digits) — keine externe Dependency.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i]!;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(input: string): Uint8Array {
  const cleaned = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('invalid base32 char');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function generateTotpSecret(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return base32Encode(bytes);
}

export function buildOtpauthUri(secret: string, accountEmail: string, issuer = 'Mandantor'): string {
  const label = encodeURIComponent(`${issuer}:${accountEmail}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

async function hmacSha1(key: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(sig);
}

async function generateCodeAtCounter(secret: string, counter: number): Promise<string> {
  const key = base32Decode(secret);
  // Counter as 8-byte big-endian
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter & 0xffffffff);
  const hmac = await hmacSha1(key, new Uint8Array(buf));
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const binary =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return (binary % 1_000_000).toString().padStart(6, '0');
}

export async function verifyTotp(
  secret: string,
  code: string,
  windowSize = 1,
): Promise<boolean> {
  const cleaned = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let i = -windowSize; i <= windowSize; i++) {
    const expected = await generateCodeAtCounter(secret, counter + i);
    // constant-time compare
    if (expected.length === cleaned.length) {
      let diff = 0;
      for (let j = 0; j < expected.length; j++) {
        diff |= expected.charCodeAt(j) ^ cleaned.charCodeAt(j);
      }
      if (diff === 0) return true;
    }
  }
  return false;
}

// ── Recovery Codes ───────────────────────────────────────────────────────

const RECOVERY_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'; // ohne 0 O 1 l

export function generateRecoveryCodes(count = 8): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let j = 0; j < 10; j++) {
      code += RECOVERY_ALPHABET[bytes[j]! % RECOVERY_ALPHABET.length];
    }
    // formatieren als xxxxx-xxxxx
    out.push(code.slice(0, 5) + '-' + code.slice(5));
  }
  return out;
}

export async function hashRecoveryCode(secret: string, code: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`recovery:${code.toLowerCase().replace(/[^a-z0-9]/g, '')}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashAllRecoveryCodes(secret: string, codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashRecoveryCode(secret, c)));
}
