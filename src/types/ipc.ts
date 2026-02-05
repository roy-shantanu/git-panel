export type RepoId = string;

export interface RepoOpenRequest {
  path: string;
}

export interface RepoStatusRequest {
  repo_id: RepoId;
}

export interface RepoDiffRequest {
  repo_id: RepoId;
  path: string;
  kind: RepoDiffKind;
}

export type RepoDiffKind = "unstaged" | "staged";

export interface RepoPathRequest {
  repo_id: RepoId;
  path: string;
}

export interface RepoBranchListRequest {
  repo_id: RepoId;
}

export interface RepoCheckoutRequest {
  repo_id: RepoId;
  target: CheckoutTarget;
}

export interface RepoCreateBranchRequest {
  repo_id: RepoId;
  name: string;
  from?: string;
}

export interface RepoFetchRequest {
  repo_id: RepoId;
  remote?: string;
}

export interface RepoSummary {
  repo_id: RepoId;
  path: string;
  name: string;
  is_valid: boolean;
}

export interface RepoStatus {
  repo_id: RepoId;
  head: RepoHead;
  counts: RepoCounts;
  files: StatusFile[];
}

export interface RepoHead {
  branch_name: string;
  oid_short: string;
}

export interface RepoCounts {
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
}

export interface StatusFile {
  path: string;
  status: StatusKind;
  old_path?: string;
}

export type StatusKind =
  | "staged"
  | "unstaged"
  | "both"
  | "untracked"
  | "conflicted";

export interface RepoListItem {
  repo_id: RepoId;
  path: string;
  name: string;
  last_opened: number;
}

export interface AppVersion {
  version: string;
}

export interface UnifiedDiffText {
  text: string;
}

export interface BranchList {
  current: string;
  locals: string[];
  remotes: string[];
  ahead_behind?: Record<string, { ahead: number; behind: number }>;
}

export interface CheckoutTarget {
  type: "local" | "remote";
  name: string;
}

export interface CheckoutResult {
  head: RepoHead;
}

export interface BranchCreateResult {
  name: string;
}

export interface FetchResult {
  remote: string;
  updated: boolean;
}

export type RepoError =
  | { type: "DirtyWorkingTree"; message: string }
  | { type: "GitError"; message: string };
