import type { Env, Viewer, PostMeta } from '../types';
import { getAllMeta, getPost } from '../github';
import { evaluateAccess } from '../access';
import {
  resolveViewer,
  githubAuthUrl,
  exchangeCode,
  createSession,
  sessionCookie,
  clearCookie,
  sessionExpiry,
  makeState,
  stateCookie,
  readStateCookie,
  verifyPasscode,
} from '../auth';

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

function publicMeta(m: PostMeta) {
  return {
    slug: m.slug,
    title: m.title,
    date: m.date,
    updated: m.updated,
    category: m.category,
    tags: m.tags,
    summary: m.summary,
    cover: m.cover,
    visibility: m.visibility,
    locked: m.visibility === 'password',
  };
}

export async function handleList(req: Request, env: Env, viewer: Viewer): Promise<Response> {
  const all = await getAllMeta(env);
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const tag = url.searchParams.get('tag');
  const category = url.searchParams.get('category');

  let items = all.filter((m) => evaluateAccess(m, viewer, new Set()).canList);
  if (tag) items = items.filter((m) => m.tags.some((t) => t.toLowerCase() === tag.toLowerCase()));
  if (category)
    items = items.filter((m) => (m.category || '').toLowerCase() === category.toLowerCase());
  if (q)
    items = items.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.summary || '').toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q)),
    );

  return json({
    viewer: { kind: viewer.kind, label: viewer.label },
    total: items.length,
    posts: items.map(publicMeta),
  });
}

export async function handlePost(
  req: Request,
  env: Env,
  viewer: Viewer,
  slug: string,
  unlocked: Set<string>,
): Promise<Response> {
  const meta = (await getAllMeta(env)).find((m) => m.slug === slug);
  if (!meta) return json({ error: 'not_found' }, 404);

  const access = evaluateAccess(meta, viewer, unlocked);
  if (!access.canRead) {
    if (access.requiresPassword) {
      return json({ error: 'password_required', locked: true, meta: publicMeta(meta) }, 401);
    }
    return json({ error: 'forbidden' }, 403);
  }
  const post = await getPost(env, slug);
  if (!post) return json({ error: 'not_found' }, 404);
  return json({ ...publicMeta(post), html: post.html });
}

export async function handleUnlock(req: Request, env: Env, slug: string): Promise<Response> {
  let body: { password?: string };
  try {
    body = (await req.json()) as { password?: string };
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const pass = body.password || '';
  const meta = (await getAllMeta(env)).find((m) => m.slug === slug);
  if (!meta || meta.visibility !== 'password') return json({ error: 'not_found' }, 404);

  const ok = await verifyPasscode(env, slug, pass);
  if (!ok) return json({ error: 'wrong_password' }, 401);

  const token = await createSession(
    { id: `pw:${slug}`, label: 'password', github: null, exp: sessionExpiry() },
    env.GITHUB_CLIENT_SECRET,
  );
  return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token) });
}

export async function handleAuthStart(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const redirect = `${url.origin}/api/auth/callback`;
  const state = makeState();
  const target = githubAuthUrl(env, state, redirect);
  return new Response(null, {
    status: 302,
    headers: { Location: target, 'Set-Cookie': stateCookie(state) },
  });
}

export async function handleAuthCallback(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const expect = readStateCookie(req);
  if (!code || !state || !expect || state !== expect) {
    return new Response('Invalid OAuth state', { status: 400 });
  }
  const user = await exchangeCode(env, code);
  if (!user) return new Response('OAuth exchange failed', { status: 400 });

  const token = await createSession(
    { id: user.id, label: user.login, github: user.login, exp: sessionExpiry() },
    env.GITHUB_CLIENT_SECRET,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': sessionCookie(token),
    },
  });
}

export async function handleLogout(): Promise<Response> {
  return new Response(null, { status: 302, headers: { Location: '/', 'Set-Cookie': clearCookie() } });
}

export async function handleMe(env: Env, viewer: Viewer): Promise<Response> {
  return json({
    kind: viewer.kind,
    label: viewer.label,
    github: viewer.github,
    isOwner: viewer.kind === 'owner',
  });
}