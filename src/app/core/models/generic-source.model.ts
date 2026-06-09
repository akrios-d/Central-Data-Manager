export type SourceStatus = 'success' | 'failure' | 'running' | 'unknown' | 'error';

export interface GenericSourceMapping {
  raw: string;
  mapped: SourceStatus;
}

export interface GenericSource {
  id: string;
  name: string;
  url: string;
  /** HTTP method used when polling/testing. Defaults to 'GET' when absent. */
  method?: 'GET' | 'POST';
  /** Optional JSON body sent with POST requests. */
  body?: string;
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
  /**
   * How the Orchestrator uses this source when the node runs.
   * 'once'  → single fetch, map immediately (no waiting).
   * 'poll'  → keep fetching until success/failure or orchMaxPolls is exhausted.
   * Defaults to 'poll' when absent (backward-compatible).
   */
  orchMode?: 'once' | 'poll';
  /** Poll interval in seconds for orchestrator runs. Falls back to global AppSettings. */
  orchPollIntervalSec?: number;
  /** Max number of polls for orchestrator runs. Falls back to global AppSettings. */
  orchMaxPolls?: number;
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
