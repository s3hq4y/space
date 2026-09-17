import type { Env, Viewer } from './types';
import { resolveViewer, readSession, getCookie } from './auth';
import {
  handleList,
  handlePost,
  handleUnlock,
  handleAuthStart,
  handleAuthCallback,
  handleLogout,
  handleMe,
} from './routes/api';

async function getUnlockedSlugs(req: Request, env: Env): Promise<Set<string>> {
  const sess = await readSession(getCookie(req), env.GITHUB_CLIENT_SECRET);
  const out = new Set<string>();
  if (sess && sess.id.startsWith('pw:')) out.add(sess.id.slice(3));
  return out;
}

function notFound(): Response {
  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // ---- API ----
    if (path.startsWith('/api/')) {
      const viewer: Viewer = await resolveViewer(env, req);

      if (path === '/api/posts' && method === 'GET') {
        return handleList(req, env, viewer);
      }
      if (path === '/api/me' && method === 'GET') {
        return handleMe(env, viewer);
      }
      if (path === '/api/auth/start' && method === 'GET') {
        return handleAuthStart(req, env);
      }
      if (path === '/api/auth/callback' && method === 'GET') {
        return handleAuthCallback(req, env);
      }
      if (path === '/api/logout' && method === 'GET') {
        return handleLogout();
      }
      const postMatch = path.match(/^\/api\/posts\/([^/]+)$/);
      if (postMatch && method === 'GET') {
        const unlocked = await getUnlockedSlugs(req, env);
        return handlePost(req, env, viewer, decodeURIComponent(postMatch[1]), unlocked);
      }
      const unlockMatch = path.match(/^\/api\/posts\/([^/]+)\/unlock$/);
      if (unlockMatch && method === 'POST') {
        return handleUnlock(req, env, decodeURIComponent(unlockMatch[1]));
      }
      return notFound();
    }

    // ---- Static assets (SPA) ----
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;