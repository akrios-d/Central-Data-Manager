export type NodeRunStatus = 'idle' | 'running' | 'success' | 'failure' | 'skipped';

export interface OrchNode {
  id: string;
  type: 'start' | 'chain';
  chainId?: string;
  label?: string;
  x: number;
  y: number;
  disabled?: boolean;
  disabledSteps?: string[];
}

export interface OrchEdge {
  id: string;
  fromId: string;
  toId: string;
}

export interface OrchGraph {
  id: string;
  name: string;
  nodes: OrchNode[];
  edges: OrchEdge[];
  createdAt: string;
}

export type NodeStepStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped';

export interface OrchNodeStepRun {
  stepName: string;
  repoFullName: string;
  status: NodeStepStatus;
  error?: string;
  runUrl?: string;
}

export interface OrchNodeRun {
  nodeId: string;
  status: NodeRunStatus;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  steps?: OrchNodeStepRun[];
}

export interface OrchRun {
  id: string;
  graphId: string;
  graphName: string;
  startedAt: string;
  status: 'running' | 'success' | 'failure' | 'stopped';
  nodes: OrchNodeRun[];
}
