use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::git;
use crate::model::{AppVersion, RepoOpenRequest, RepoStatusRequest, RepoSummary};
use crate::store::AppState;

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
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };

    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let status = git::status(&summary);

    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    guard.set_status(status.clone());
    Ok(status)
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

