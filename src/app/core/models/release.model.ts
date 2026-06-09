import { CiProviderType } from '../interfaces/ci-provider.interface';

export interface ReleaseEnv {
  id: string;
  name: string;
  order: number;
  color?: string;
}

export interface RepoEntry {
  id: string;
  repoName: string;
  provider?: CiProviderType;
  deployments: Record<string, string>;
  updatedAt: Record<string, string>;
}
