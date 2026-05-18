export interface ChainStep {
  id: string;
  repoFullName: string;
  repoName: string;
  workflowId: number;
  workflowName: string;
  ref: string;
  inputs: Record<string, string>;
  clearCache?: boolean;
}

export interface Chain {
  id: string;
  name: string;
  ref: string;
  steps: ChainStep[];
  createdAt: string;
}

export type StepStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';
export type ChainRunStatus = 'running' | 'success' | 'failure' | 'stopped';

export interface ChainStepRun {
  stepId: string;
  status: StepStatus;
  runId?: number;
  runUrl?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ChainRun {
  id: string;
  chainId: string;
  chainName: string;
  startedAt: string;
  status: ChainRunStatus;
  steps: ChainStepRun[];
}
