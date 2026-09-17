import type { Env, Post, PostMeta } from './types';
import { parseFrontmatter, buildMeta, slugify } from './frontmatter';
import { renderMarkdown } from './render';

interface TreeItem {
  path: string;
  type: string;
}

interface CacheEntry {
  meta: PostMeta[];
  at: number;
}

const LIST_TTL_MS = 60_000;
let listCache: CacheEntry | null = null;

function repoParts(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');
  return { owner, name };
}

function ghHeaders(env: Env): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'space-worker',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function ghJson<T>(env: Env, url: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders(env) });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

async function ghRaw(env: Env, url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { ...ghHeaders(env), Accept: 'application/vnd.github.raw' },
  });
  if (!res.ok) throw new Error(`GitHub raw ${res.status}`);
  return await res.text();
}

async function loadAllMeta(env: Env): Promise<PostMeta[]> {
  if (listCache && Date.now() - listCache.at < LIST_TTL_MS) {
    return listCache.meta;
  }
  const { owner, name } = repoParts(env.DATA_REPO);
  const tree = await ghJson<{ tree: TreeItem[] }>(
    env,
    `https://api.github.com/repos/${owner}/${name}/git/trees/${env.DATA_BRANCH}?recursive=1`,
  );
  const mdFiles = tree.tree
    .filter((t) => t.type === 'blob' && /^posts\/.*\.md$/i.test(t.path))
    .map((t) => t.path);

  const meta: PostMeta[] = [];
  for (const path of mdFiles) {
    try {
      const raw = await ghRaw(
        env,
        `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?ref=${env.DATA_BRANCH}`,
      );
      const { data } = parseFrontmatter(raw);
      if (data.draft === true) continue;
      const slug = data.slug ? slugify(String(data.slug)) : slugify(path.replace(/^posts\//, ''));
      meta.push(buildMeta(slug, data));
    } catch {
      // skip unreadable file
    }
  }
  meta.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  listCache = { meta, at: Date.now() };
  return meta;
}

export async function getAllMeta(env: Env): Promise<PostMeta[]> {
  return loadAllMeta(env);
}

export async function getPost(env: Env, slug: string): Promise<Post | null> {
  const metas = await loadAllMeta(env);
  const found = metas.find((m) => m.slug === slug);
  if (!found) return null;

  const { owner, name } = repoParts(env.DATA_REPO);
  const tree = await ghJson<{ tree: TreeItem[] }>(
    env,
    `https://api.github.com/repos/${owner}/${name}/git/trees/${env.DATA_BRANCH}?recursive=1`,
  );
  const path = tree.tree
    .filter((t) => t.type === 'blob' && /^posts\/.*\.md$/i.test(t.path))
    .find((t) => {
      const s = slugify(t.path.replace(/^posts\//, ''));
      return s === slug;
    })?.path;
  if (!path) return null;

  const raw = await ghRaw(
    env,
    `https://api.github.com/repos/${owner}/${name}/contents/${encodeURIComponent(path)}?ref=${env.DATA_BRANCH}`,
  );
  const { body } = parseFrontmatter(raw);
  return { ...found, html: renderMarkdown(body) };
}

export function invalidateCache(): void {
  listCache = null;
}