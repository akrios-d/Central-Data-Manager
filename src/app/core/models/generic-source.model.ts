export type SourceStatus = 'success' | 'failure' | 'running' | 'unknown' | 'error';

export interface GenericSourceMapping {
  raw: string;
  mapped: SourceStatus;
}

export interface GenericSource {
  id: string;
  name: string;
  url: string;
  authType: 'none' | 'bearer' | 'basic';
  authToken?: string;
  authUser?: string;
  authPass?: string;
  pollIntervalSec: number;
  enabled: boolean;
  /** Dot-notation path to the status field, e.g. "lastBuild.result" */
  statusPath: string;
  mappings: GenericSourceMapping[];
  /** Dot-notation path to a display name field (optional) */
  namePath?: string;
  /** Dot-notation path to a run URL field (optional) */
  urlPath?: string;
  createdAt: string;
}

export interface GenericSourceResult {
  sourceId: string;
  fetchedAt: string;
  status: SourceStatus;
  displayName?: string;
  runUrl?: string;
  rawStatus?: string;
  error?: string;
}
