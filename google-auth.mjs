import {createPublicKey, verify} from 'node:crypto';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
let cachedKeys = null;
let cachedUntil = 0;
let pendingKeys = null;

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw Error('Invalid Google credential.');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

async function getKeys(fetchKeys) {
  if (fetchKeys) return fetchKeys();
  if (cachedKeys && Date.now() < cachedUntil) return cachedKeys;
  if (!pendingKeys) pendingKeys = (async () => {
    let response;
    try { response = await fetch(CERTS_URL, {signal:AbortSignal.timeout(5000)}); }
    catch { throw Error('Google sign-in is temporarily unavailable.'); }
    if (!response.ok) throw Error('Google sign-in is temporarily unavailable.');
    const keys = await response.json();
    if (!Array.isArray(keys.keys)) throw Error('Google sign-in is temporarily unavailable.');
    const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 300);
    cachedKeys = keys;
    cachedUntil = Date.now() + Math.min(Math.max(seconds, 60), 3600) * 1000;
    return keys;
  })();
  try { return await pendingKeys; } finally { pendingKeys = null; }
}

export async function verifyGoogleIdToken(token, clientId, fetchKeys) {
  if (typeof token !== 'string' || token.length > 8192) throw Error('Invalid Google credential.');
  const parts = token.split('.');
  if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[2])) throw Error('Invalid Google credential.');
  let header, claims;
  try { header = decodePart(parts[0]); claims = decodePart(parts[1]); }
  catch { throw Error('Invalid Google credential.'); }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string' || header.kid.length > 200 || !claims || typeof claims !== 'object') throw Error('Invalid Google credential.');
  const keys = await getKeys(fetchKeys);
  const jwk = keys.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && (!key.alg || key.alg === 'RS256') && (!key.use || key.use === 'sig'));
  if (!jwk) throw Error('Invalid Google credential.');
  let valid = false;
  try { valid = verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), createPublicKey({key:jwk,format:'jwk'}), Buffer.from(parts[2], 'base64url')); }
  catch { throw Error('Invalid Google credential.'); }
  const now = Math.floor(Date.now()/1000);
  if (!valid || claims.aud !== clientId || !['accounts.google.com','https://accounts.google.com'].includes(claims.iss)
      || !Number.isInteger(claims.exp) || claims.exp <= now || !Number.isInteger(claims.iat) || claims.iat > now + 60
      || (claims.nbf !== undefined && (!Number.isInteger(claims.nbf) || claims.nbf > now))
      || typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255
      || (claims.email_verified !== true && claims.email_verified !== 'true')) throw Error('Invalid Google credential.');
  return {sub:claims.sub, name:typeof claims.name === 'string' ? claims.name.trim().slice(0,80) : '', email:typeof claims.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email) ? claims.email.toLowerCase().slice(0,254) : ''};
}
