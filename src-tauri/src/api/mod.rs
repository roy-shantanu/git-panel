use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::git;
use crate::model::{
    AppVersion, RepoDiffRequest, RepoOpenRequest, RepoPathRequest, RepoStatusRequest, RepoSummary,
    UnifiedDiffText,
};
use crate::store::{now_ms, AppState};

const STATUS_TTL_MS: u64 = 500;

#[tauri::command]
pub async fn repo_open(
    req: RepoOpenRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<RepoSummary, String> {
    let summary = git::open_repo(&req.path);
    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    Ok(guard.upsert_repo(summary))
}

#[tauri::command]
pub async fn repo_status(
    req: RepoStatusRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<crate::model::RepoStatus, String> {
    let (summary, cached) = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        let cached = guard.get_status(&req.repo_id);
        (guard.get_repo(&req.repo_id), cached)
    };

    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;

    if let Some(cache) = cached {
        // Short TTL cache avoids re-running status when the UI is polling rapidly.
        if now_ms().saturating_sub(cache.updated_at_ms) < STATUS_TTL_MS {
            return Ok(cache.status);
        }
    }

    let token = {
        let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.job_queue.start_status(&summary.repo_id)
    };

    // Compute in a blocking task; only the most recent job is allowed to update the cache.
    let status = tauri::async_runtime::spawn_blocking(move || git::status(&summary))
        .await
        .map_err(|_| "status job failed".to_string())??;

    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    if guard.job_queue.is_current(&req.repo_id, token) {
        guard.set_status(status.clone());
        Ok(status)
    } else if let Some(cache) = guard.get_status(&req.repo_id) {
        // Another request superseded this one; return the latest cached status.
        Ok(cache.status)
    } else {
        Ok(status)
    }
}

#[tauri::command]
pub async fn repo_list_recent(
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<crate::model::RepoListItem>, String> {
    let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    Ok(guard.list_recent())
}

#[tauri::command]
pub async fn app_version(app: AppHandle) -> Result<AppVersion, String> {
    Ok(AppVersion {
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub async fn repo_diff(
    req: RepoDiffRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<UnifiedDiffText, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::diff_for_path(&summary, &req.path, req.kind)
}

#[tauri::command]
pub async fn repo_stage(
    req: RepoPathRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::stage_path(&summary, &req.path)
}

#[tauri::command]
pub async fn repo_unstage(
    req: RepoPathRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::unstage_path(&summary, &req.path)
}
