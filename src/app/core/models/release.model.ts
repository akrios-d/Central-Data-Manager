export interface ReleaseEnv {
  id: string;
  name: string;
  order: number;
}

export interface RepoEntry {
  id: string;
  repoName: string;
  deployments: Record<string, string>;
  updatedAt: Record<string, string>;
}
