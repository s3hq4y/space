import type { PostMeta, Viewer, Env } from './types';

export interface AccessState {
  canList: boolean;
  canRead: boolean;
  requiresPassword: boolean;
}

export function evaluateAccess(
  meta: PostMeta,
  viewer: Viewer,
  unlockedSlugs: Set<string>,
): AccessState {
  if (viewer.kind === 'owner') {
    return { canList: true, canRead: true, requiresPassword: false };
  }
  switch (meta.visibility) {
    case 'public':
      return { canList: true, canRead: true, requiresPassword: false };
    case 'unlisted':
      return { canList: false, canRead: true, requiresPassword: false };
    case 'friends':
      return {
        canList: viewer.kind === 'friend',
        canRead: viewer.kind === 'friend',
        requiresPassword: false,
      };
    case 'password': {
      const unlocked = unlockedSlugs.has(meta.slug);
      return { canList: true, canRead: unlocked, requiresPassword: !unlocked };
    }
    case 'private':
      return { canList: false, canRead: false, requiresPassword: false };
    default:
      return { canList: false, canRead: false, requiresPassword: false };
  }
}

export async function loadFriendAllowlist(env: Env): Promise<Set<string>> {
  const raw = await env.SPACE_KV.get('friends:allowlist');
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as string[];
    return new Set(arr.map((s) => s.toLowerCase()));
  } catch {
    return new Set();
  }
}

export function isOwner(env: Env, github: string | null): boolean {
  if (!github) return false;
  return github.toLowerCase() === env.SITE_OWNER_GITHUB.toLowerCase();
}

export function isFriend(allow: Set<string>, github: string | null): boolean {
  if (!github) return false;
  return allow.has(github.toLowerCase());
}