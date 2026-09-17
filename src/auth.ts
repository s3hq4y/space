import type { Env, Viewer, SessionData } from './types';
import { isOwner, isFriend, loadFriendAllowlist } from './access';

const COOKIE = 'space_session';
const SESSION_DAYS = 30;

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncodeStr(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}

function b64urlDecodeStr(s: string): string {
  return new TextDecoder().decode(b64urlDecode(s));
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return b64urlEncode(new Uint8Array(sig));
}

export async function createSession(data: SessionData, secret: string): Promise<string> {
  const payload = b64urlEncodeStr(JSON.stringify(data));
  const sig = await sign(payload, secret);
  return `${payload}.${sig}`;
}

export async function readSession(
  token: string | undefined,
  secret: string,
): Promise<SessionData | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = await sign(payload, secret);
  if (expect !== sig) return null;
  try {
    const data = JSON.parse(b64urlDecodeStr(payload)) as SessionData;
    if (typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string): string {
  const maxAge = SESSION_DAYS * 24 * 3600;
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getCookie(req: Request): string | undefined {
  const h = req.headers.get('Cookie') || '';
  const m = h.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? m[1] : undefined;
}

export function sessionExpiry(): number {
  return Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
}

export async function resolveViewer(env: Env, req: Request): Promise<Viewer> {
  const sess = await readSession(getCookie(req), env.GITHUB_CLIENT_SECRET);
  if (!sess) return { kind: 'guest', id: null, label: null, github: null };
  if (isOwner(env, sess.github)) {
    return { kind: 'owner', id: sess.id, label: sess.label, github: sess.github };
  }
  const allow = await loadFriendAllowlist(env);
  if (isFriend(allow, sess.github)) {
    return { kind: 'friend', id: sess.id, label: sess.label, github: sess.github };
  }
  return { kind: 'guest', id: sess.id, label: sess.label, github: sess.github };
}

export function githubAuthUrl(env: Env, state: string, redirect: string): string {
  const p = new URLSearchParams({
    client_id: env.GITHUB_CLIENT_ID,
    redirect_uri: redirect,
    scope: 'read:user',
    state,
  });
  return `https://github.com/login/oauth/authorize?${p.toString()}`;
}

export async function exchangeCode(env: Env, code: string): Promise<{ login: string; id: string } | null> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) return null;
  const tok = (await res.json()) as { access_token?: string };
  if (!tok.access_token) return null;
  const uRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tok.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'space-worker',
    },
  });
  if (!uRes.ok) return null;
  const u = (await uRes.json()) as { login: string; id: number };
  return { login: u.login, id: String(u.id) };
}

export async function verifyPasscode(env: Env, slug: string, code: string): Promise<boolean> {
  const meta = await env.SPACE_KV.get(`postpass:${slug}`);
  if (!meta) return false;
  const ok = await timingSafeEqual(code, meta);
  return ok;
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

export function makeState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return b64urlEncode(bytes);
}

export function stateCookie(state: string): string {
  return `space_state=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

export function readStateCookie(req: Request): string | undefined {
  const h = req.headers.get('Cookie') || '';
  const m = h.match(/(?:^|;\s*)space_state=([^;]+)/);
  return m ? m[1] : undefined;
}