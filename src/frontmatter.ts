import yaml from 'js-yaml';
import type { Frontmatter, PostMeta, Visibility } from './types';

const VALID_VIS: Visibility[] = ['public', 'unlisted', 'friends', 'password', 'private'];

export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

export function parseFrontmatter(raw: string): { data: Frontmatter; body: string } {
  const text = stripBom(raw).replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { data: {}, body: text };
  let data: Frontmatter = {};
  try {
    data = (yaml.load(m[1]) as Frontmatter) ?? {};
  } catch {
    data = {};
  }
  return { data, body: text.slice(m[0].length) };
}

export function slugify(input: string): string {
  const s = input
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'untitled';
}

function asString(v: string | Date | undefined): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

export function buildMeta(slug: string, fm: Frontmatter): PostMeta {
  const vis: Visibility =
    fm.visibility && VALID_VIS.includes(fm.visibility) ? fm.visibility : 'public';
  return {
    slug,
    title: fm.title ? String(fm.title) : slug,
    date: asString(fm.date) ?? '',
    updated: asString(fm.updated),
    category: fm.category ? String(fm.category) : undefined,
    tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
    summary: fm.summary ? String(fm.summary) : undefined,
    cover: fm.cover ? String(fm.cover) : undefined,
    visibility: vis,
    hasPassword: vis === 'password' && !!fm.password,
  };
}