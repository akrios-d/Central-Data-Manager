export type CiProviderType = 'github' | 'gitlab';

export interface CiRepo {
  id: number | string;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  provider: CiProviderType;
  html_url: string;
}

export interface CiRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_started_at?: string;
  head_branch: string;
  workflow_id: number;
  provider: CiProviderType;
}

export interface CiWorkflow {
  id: number;
  name: string;
  path: string;
}

export interface CiTag {
  name: string;
}
export interface CiBranch {
  name: string;
}

export interface CiCommit {
  sha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface CiComparison {
  status: 'identical' | 'ahead' | 'behind' | 'diverged';
  ahead_by: number;
  behind_by: number;
  commits: CiCommit[];
  html_url: string;
}
