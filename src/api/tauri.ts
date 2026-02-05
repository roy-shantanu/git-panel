import { invoke } from "@tauri-apps/api/core";
import type {
  AppVersion,
  BranchCreateResult,
  BranchList,
  Changelist,
  ChangelistState,
  CommitOptions,
  CommitPreview,
  CommitResult,
  DiffHunk,
  HunkAssignment,
  CheckoutResult,
  CheckoutTarget,
  FetchResult,
  RepoListItem,
  RepoDiffKind,
  RepoStatus,
  RepoStatusRequest,
  RepoSummary,
  UnifiedDiffText,
  WorktreeList,
  WorktreeResult
} from "../types/ipc";

export async function repoOpen(path: string): Promise<RepoSummary> {
  console.log("repo_open", path);
  return invoke("repo_open", { req: { path } });
}

export async function repoOpenWorktree(
  repo_root: string,
  worktree_path: string
): Promise<RepoSummary> {
  return invoke("repo_open_worktree", { req: { repo_root, worktree_path } });
}

export async function repoStatus(repo_id: string): Promise<RepoStatus> {
  const req: RepoStatusRequest = { repo_id };
  return invoke("repo_status", { req });
}

export async function repoDiff(
  repo_id: string,
  path: string,
  kind: RepoDiffKind
): Promise<UnifiedDiffText> {
  return invoke("repo_diff", { req: { repo_id, path, kind } });
}

export async function repoDiffHunks(
  repo_id: string,
  path: string,
  kind: RepoDiffKind
): Promise<DiffHunk[]> {
  return invoke("repo_diff_hunks", { req: { repo_id, path, kind } });
}

export async function repoStage(repo_id: string, path: string): Promise<void> {
  return invoke("repo_stage", { req: { repo_id, path } });
}

export async function repoUnstage(repo_id: string, path: string): Promise<void> {
  return invoke("repo_unstage", { req: { repo_id, path } });
}

export async function repoListRecent(): Promise<RepoListItem[]> {
  return invoke("repo_list_recent");
}

export async function appVersion(): Promise<AppVersion> {
  return invoke("app_version");
}

export async function repoBranches(repo_id: string): Promise<BranchList> {
  return invoke("repo_branches", { req: { repo_id } });
}

export async function repoCheckout(
  repo_id: string,
  target: CheckoutTarget
): Promise<CheckoutResult> {
  return invoke("repo_checkout", { req: { repo_id, target } });
}

export async function repoCreateBranch(
  repo_id: string,
  name: string,
  from?: string
): Promise<BranchCreateResult> {
  return invoke("repo_create_branch", { req: { repo_id, name, from } });
}

export async function repoFetch(
  repo_id: string,
  remote?: string
): Promise<FetchResult> {
  return invoke("repo_fetch", { req: { repo_id, remote } });
}

export async function clList(repo_id: string): Promise<ChangelistState> {
  return invoke("cl_list", { req: { repo_id } });
}

export async function clCreate(repo_id: string, name: string): Promise<Changelist> {
  return invoke("cl_create", { req: { repo_id, name } });
}

export async function clRename(repo_id: string, id: string, name: string): Promise<void> {
  return invoke("cl_rename", { req: { repo_id, id, name } });
}

export async function clDelete(repo_id: string, id: string): Promise<void> {
  return invoke("cl_delete", { req: { repo_id, id } });
}

export async function clSetActive(repo_id: string, id: string): Promise<void> {
  return invoke("cl_set_active", { req: { repo_id, id } });
}

export async function clAssignFiles(
  repo_id: string,
  changelist_id: string,
  paths: string[]
): Promise<void> {
  return invoke("cl_assign_files", { req: { repo_id, changelist_id, paths } });
}

export async function clUnassignFiles(repo_id: string, paths: string[]): Promise<void> {
  return invoke("cl_unassign_files", { req: { repo_id, paths } });
}

export async function clAssignHunks(
  repo_id: string,
  changelist_id: string,
  path: string,
  hunks: HunkAssignment[]
): Promise<void> {
  return invoke("cl_assign_hunks", { req: { repo_id, changelist_id, path, hunks } });
}

export async function clUnassignHunks(
  repo_id: string,
  path: string,
  hunk_ids: string[]
): Promise<void> {
  return invoke("cl_unassign_hunks", { req: { repo_id, path, hunk_ids } });
}

export async function commitPrepare(
  repo_id: string,
  changelist_id: string
): Promise<CommitPreview> {
  return invoke("commit_prepare", { req: { repo_id, changelist_id } });
}

export async function commitExecute(
  repo_id: string,
  changelist_id: string,
  message: string,
  options?: CommitOptions
): Promise<CommitResult> {
  return invoke("commit_execute", { req: { repo_id, changelist_id, message, options } });
}

export async function wtList(repo_root: string): Promise<WorktreeList> {
  return invoke("wt_list", { req: { repo_root, path: repo_root } });
}

export async function wtAdd(
  repo_root: string,
  path: string,
  branch_name: string,
  new_branch?: boolean
): Promise<WorktreeResult> {
  return invoke("wt_add", { req: { repo_root, path, branch_name, new_branch } });
}

export async function wtRemove(repo_root: string, path: string): Promise<WorktreeResult> {
  return invoke("wt_remove", { req: { repo_root, path } });
}

export async function wtPrune(repo_root: string): Promise<WorktreeResult> {
  return invoke("wt_prune", { req: { repo_root, path: repo_root } });
}
