export type RepoId = string;

export interface RepoOpenRequest {
  path: string;
}

export interface RepoStatusRequest {
  repo_id: RepoId;
}

export interface RepoSummary {
  repo_id: RepoId;
  path: string;
  name: string;
  is_valid: boolean;
}

export interface RepoStatus {
  repo_id: RepoId;
  branch: string;
  staged: number;
  changed: number;
  untracked: number;
  ahead: number;
  behind: number;
  last_updated: number;
}

export interface RepoListItem {
  repo_id: RepoId;
  path: string;
  name: string;
  last_opened: number;
}

export interface AppVersion {
  version: string;
}
