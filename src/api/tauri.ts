import { invoke } from "@tauri-apps/api/core";
import type {
  AppVersion,
  RepoListItem,
  RepoStatus,
  RepoStatusRequest,
  RepoSummary
} from "../types/ipc";

export async function repoOpen(path: string): Promise<RepoSummary> {
  console.log("repo_open", path);
  return invoke("repo_open", { req: { path } });
}

export async function repoStatus(repo_id: string): Promise<RepoStatus> {
  const req: RepoStatusRequest = { repo_id };
  return invoke("repo_status", { req });
}

export async function repoListRecent(): Promise<RepoListItem[]> {
  return invoke("repo_list_recent");
}

export async function appVersion(): Promise<AppVersion> {
  return invoke("app_version");
}
