async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hashToken(secret: string, token: string): Promise<string> {
  return hmacSha256(secret, `token:${token}`);
}

export function hashIp(secret: string, ip: string | null): Promise<string> {
  return hmacSha256(secret, `ip:${ip ?? ''}`).then((h) => h.slice(0, 32));
}

export function hashUa(secret: string, ua: string | null): Promise<string> {
  return hmacSha256(secret, `ua:${ua ?? ''}`).then((h) => h.slice(0, 32));
}
