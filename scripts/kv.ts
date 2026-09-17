#!/usr/bin/env node
/**
 * KV 运维脚本。用法（在 space 目录下）：
 *
 *   npm run kv -- friends list
 *   npm run kv -- friends add <github-login>
 *   npm run kv -- friends remove <github-login>
 *   npm run kv -- pass set <slug> <password>
 *   npm run kv -- pass remove <slug>
 */
import { execFileSync } from 'node:child_process';

const BINDING = 'SPACE_KV';
const FRIENDS_KEY = 'friends:allowlist';

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', ...args], { encoding: 'utf8' });
}

function get(key: string): string | null {
  try {
    const out = wrangler(['kv', 'key', 'get', key, '--binding', BINDING, '--remote']);
    return out.trim() || null;
  } catch {
    return null;
  }
}

function put(key: string, value: string): void {
  wrangler(['kv', 'key', 'put', key, value, '--binding', BINDING, '--remote']);
}

function del(key: string): void {
  try {
    wrangler(['kv', 'key', 'delete', key, '--binding', BINDING, '--remote']);
  } catch {
    // ignore
  }
}

function loadFriends(): string[] {
  const raw = get(FRIENDS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveFriends(list: string[]): void {
  put(FRIENDS_KEY, JSON.stringify([...new Set(list.map((s) => s.toLowerCase()))]));
}

const [cmd, sub, ...rest] = process.argv.slice(2);

if (cmd === 'friends') {
  const list = loadFriends();
  if (sub === 'list') {
    console.log(list.length ? list.join('\n') : '(空)');
  } else if (sub === 'add' && rest[0]) {
    list.push(rest[0]);
    saveFriends(list);
    console.log(`added ${rest[0]}`);
  } else if (sub === 'remove' && rest[0]) {
    saveFriends(list.filter((s) => s !== rest[0].toLowerCase()));
    console.log(`removed ${rest[0]}`);
  } else {
    console.log('usage: friends list|add <login>|remove <login>');
  }
} else if (cmd === 'pass') {
  if (sub === 'set' && rest[0] && rest[1]) {
    put(`postpass:${rest[0]}`, rest[1]);
    console.log(`password set for ${rest[0]}`);
  } else if (sub === 'remove' && rest[0]) {
    del(`postpass:${rest[0]}`);
    console.log(`password removed for ${rest[0]}`);
  } else {
    console.log('usage: pass set <slug> <password> | pass remove <slug>');
  }
} else {
  console.log('usage: kv -- friends ... | pass ...');
}