import { invoke } from "@tauri-apps/api/core";
import type {
  AppVersion,
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
