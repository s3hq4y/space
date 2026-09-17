export type Visibility = 'public' | 'unlisted' | 'friends' | 'password' | 'private';

export interface Frontmatter {
  title?: string;
  date?: string | Date;
  updated?: string | Date;
  category?: string;
  tags?: string[];
  summary?: string;
  cover?: string;
  visibility?: Visibility;
  password?: string;
  draft?: boolean;
  slug?: string;
}

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  updated?: string;
  category?: string;
  tags: string[];
  summary?: string;
  cover?: string;
  visibility: Visibility;
  hasPassword: boolean;
}

export interface Post extends PostMeta {
  html: string;
}

export type ViewerKind = 'owner' | 'friend' | 'guest';

export interface Viewer {
  kind: ViewerKind;
  id: string | null;
  label: string | null;
  github: string | null;
}

export interface SessionData {
  id: string;
  label: string;
  github: string | null;
  exp: number;
}

export interface Env {
  ASSETS: Fetcher;
  SPACE_KV: KVNamespace;
  DATA_REPO: string;
  DATA_BRANCH: string;
  GITHUB_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  SITE_OWNER_GITHUB: string;
  SITE_TITLE: string;
}