export interface BoardProject {
  id: string;
  name: string;
}

export interface BoardWorkItem {
  id: number | string;
  title: string;
  type: string;
  state: string;
  assignee: string | null;
  sprint: string | null;
  url: string;
  priorityEmoji: string;
  priorityLabel: string | null;
  createdDate: string;
  changedDate: string;
  description?: string | null;
  severity?: string | null;
  areaPath?: string | null;
  createdBy?: string | null;
  tags?: string[];
}

export interface BoardSprint {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface BlockerRelation {
  sourceId: number | string;
  targetId: number | string;
}

export interface BlockerData {
  items: Map<number | string, BoardWorkItem>;
  relations: BlockerRelation[];
}

export interface BoardFilters {
  sprint: 'current' | 'all';
  types: string[];
  assignee: string;
  hiddenStates: string[];
}
