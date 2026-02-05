import { invoke } from "@tauri-apps/api/core";
import type {
  AppVersion,
  BranchCreateResult,
  BranchList,
  CheckoutResult,
  CheckoutTarget,
  FetchResult,
  RepoListItem,
  RepoDiffKind,
  RepoStatus,
  RepoStatusRequest,
  RepoSummary,
  UnifiedDiffText
} from "../types/ipc";

export async function repoOpen(path: string): Promise<RepoSummary> {
  console.log("repo_open", path);
  return invoke("repo_open", { req: { path } });
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
