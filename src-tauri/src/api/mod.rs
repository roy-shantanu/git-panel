use std::sync::Mutex;

use tauri::{AppHandle, State};

use crate::changelist;
use crate::git;
use crate::model::{
    AppVersion, BranchCreateResult, BranchList, Changelist, ChangelistAssignHunksRequest,
    ChangelistAssignRequest, ChangelistCreateRequest, ChangelistIdRequest, ChangelistRenameRequest,
    ChangelistState, ChangelistUnassignHunksRequest, ChangelistUnassignRequest, CheckoutResult,
    CommitExecuteRequest, CommitPrepareRequest, CommitPreview, CommitResult, CommitStagedRequest,
    DiffHunk, HunkAssignment, RepoBranchListRequest, RepoCheckoutRequest, RepoCreateBranchRequest,
    RepoDiffPayload, RepoDiffRequest, RepoFetchRequest, RepoOpenRequest, RepoOpenWorktreeRequest,
    RepoPathRequest, RepoStatusRequest, RepoSummary, UnifiedDiffText, WorktreeAddRequest,
    WorktreeList, WorktreePathRequest, WorktreeResult,
};
use crate::store::{now_ms, AppState};
use std::time::Instant;

const STATUS_TTL_MS: u64 = 1500;

#[tauri::command]
pub async fn repo_open(
    req: RepoOpenRequest,
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<RepoSummary, String> {
    let summary = git::open_repo(&req.path);
    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    if summary.is_valid {
        if let Ok(watcher) = crate::watch::RepoWatcher::new(
            app,
            summary.repo_id.clone(),
            summary.worktree_path.clone(),
        ) {
            guard.upsert_watcher(&summary.repo_id, watcher);
        }
    }
    Ok(guard.upsert_repo(summary))
}

#[tauri::command]
pub async fn repo_open_worktree(
    req: RepoOpenWorktreeRequest,
    app: AppHandle,
    state: State<'_, Mutex<AppState>>,
) -> Result<RepoSummary, String> {
    let mut summary = git::open_repo(&req.worktree_path);
    summary.repo_root = req.repo_root;
    summary.worktree_path = req.worktree_path.clone();
    summary.repo_id = git::repo_id_for_path(&summary.worktree_path);
    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    if summary.is_valid {
        if let Ok(watcher) = crate::watch::RepoWatcher::new(
            app,
            summary.repo_id.clone(),
            summary.worktree_path.clone(),
        ) {
            guard.upsert_watcher(&summary.repo_id, watcher);
        }
    }
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
    let summary_for_job = summary.clone();
    let start = Instant::now();
    let status = tauri::async_runtime::spawn_blocking(move || git::status(&summary_for_job))
        .await
        .map_err(|_| "status job failed".to_string())??;
    tracing::info!(
        repo_id = %summary.repo_id,
        duration_ms = start.elapsed().as_millis(),
        "status computed"
    );

    let mut status = status;
    if let Ok(mut cl_state) = changelist::load_state(&summary) {
        let _ = changelist::apply_to_status(&summary, &mut cl_state, &mut status);
    }

    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    if guard
        .job_queue
        .is_current(&req.repo_id, crate::jobs::JobKind::Status, token)
    {
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
    let cache_key = git::diff_cache_key(&summary, &req.path, req.kind.clone()).ok();
    if let Some(key) = cache_key.as_ref() {
        if let Ok(guard) = state.lock() {
            if let Some(cached) = guard.get_diff_cache(key) {
                return Ok(cached);
            }
        }
    }

    let token = {
        let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.job_queue.start_diff(&summary.repo_id)
    };

    let summary_for_job = summary.clone();
    let path = req.path.clone();
    let kind = req.kind.clone();
    let start = Instant::now();
    let diff = tauri::async_runtime::spawn_blocking(move || {
        git::diff_for_path(&summary_for_job, &path, kind)
    })
    .await
    .map_err(|_| "diff job failed".to_string())??;

    tracing::info!(
        repo_id = %summary.repo_id,
        path = %req.path,
        duration_ms = start.elapsed().as_millis(),
        "diff computed"
    );

    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    if !guard
        .job_queue
        .is_current(&req.repo_id, crate::jobs::JobKind::Diff, token)
    {
        return Err("diff superseded".to_string());
    }

    if let Some(key) = cache_key {
        guard.set_diff_cache(key, diff.clone());
    }
    Ok(diff)
}

#[tauri::command]
pub async fn repo_diff_hunks(
    req: RepoDiffRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<Vec<DiffHunk>, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let path = req.path.clone();
    let kind = req.kind.clone();
    let cache_key = git::diff_cache_key(&summary, &path, kind.clone()).ok();
    if let Some(key) = cache_key.as_ref() {
        if let Ok(guard) = state.lock() {
            if let Some(cached) = guard.get_diff_cache(key) {
                let all_hunks = git::diff_hunks_from_text(&cached.text, &path, kind.clone());
                let filtered = filter_hunks_for_path(all_hunks.clone(), &path);
                return Ok(if filtered.is_empty() {
                    all_hunks
                } else {
                    filtered
                });
            }
        }
    }

    let diff = repo_diff(req, state).await?;
    let all_hunks = git::diff_hunks_from_text(&diff.text, &path, kind);
    let filtered = filter_hunks_for_path(all_hunks.clone(), &path);
    Ok(if filtered.is_empty() {
        all_hunks
    } else {
        filtered
    })
}

#[tauri::command]
pub async fn repo_diff_payload(
    req: RepoDiffRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<RepoDiffPayload, String> {
    let started = Instant::now();
    let path = req.path.clone();
    let kind = req.kind.clone();
    let diff = repo_diff(req, state).await?;
    let all_hunks = git::diff_hunks_from_text(&diff.text, &path, kind);
    let filtered = filter_hunks_for_path(all_hunks.clone(), &path);
    let hunks = if filtered.is_empty() {
        all_hunks
    } else {
        filtered
    };
    tracing::info!(
        path = %path,
        hunks = hunks.len(),
        text_len = diff.text.len(),
        duration_ms = started.elapsed().as_millis(),
        "repo_diff_payload"
    );
    Ok(RepoDiffPayload {
        text: diff.text,
        hunks,
    })
}

#[tauri::command]
pub async fn wt_list(req: WorktreePathRequest) -> Result<WorktreeList, String> {
    tauri::async_runtime::spawn_blocking(move || git::list_worktrees(&req.repo_root))
        .await
        .map_err(|_| "worktree list failed".to_string())?
}

#[tauri::command]
pub async fn wt_add(req: WorktreeAddRequest) -> Result<WorktreeResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        git::add_worktree(&req.repo_root, &req.path, &req.branch_name, req.new_branch)
    })
    .await
    .map_err(|_| "worktree add failed".to_string())?
}

#[tauri::command]
pub async fn wt_remove(req: WorktreePathRequest) -> Result<WorktreeResult, String> {
    tauri::async_runtime::spawn_blocking(move || git::remove_worktree(&req.repo_root, &req.path))
        .await
        .map_err(|_| "worktree remove failed".to_string())?
}

#[tauri::command]
pub async fn wt_prune(req: WorktreePathRequest) -> Result<WorktreeResult, String> {
    tauri::async_runtime::spawn_blocking(move || git::prune_worktrees(&req.repo_root))
        .await
        .map_err(|_| "worktree prune failed".to_string())?
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
    git::stage_path(&summary, &req.path)?;
    if let Err(error) = refresh_cached_status(&summary, &state) {
        tracing::warn!(
            repo_id = %summary.repo_id,
            path = %req.path,
            error = %error,
            "failed to refresh cached status after stage"
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn repo_track(
    req: RepoPathRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::track_path(&summary, &req.path)?;
    if let Err(error) = refresh_cached_status(&summary, &state) {
        tracing::warn!(
            repo_id = %summary.repo_id,
            path = %req.path,
            error = %error,
            "failed to refresh cached status after track"
        );
    }
    Ok(())
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
    git::unstage_path(&summary, &req.path)?;
    if let Err(error) = refresh_cached_status(&summary, &state) {
        tracing::warn!(
            repo_id = %summary.repo_id,
            path = %req.path,
            error = %error,
            "failed to refresh cached status after unstage"
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn repo_delete_unversioned(
    req: RepoPathRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let path = req.path.trim().to_string();
    if path.is_empty() {
        return Err("path is required".to_string());
    }

    let status = git::status(&summary)?;
    let is_unversioned = status.files.iter().any(|file| {
        file.path == path && matches!(file.status, crate::model::StatusKind::Untracked)
    });
    if !is_unversioned {
        return Err("Only unversioned files can be deleted.".to_string());
    }

    git::delete_unversioned_path(&summary, &path)?;
    changelist::clear_assignments(&summary, &[path])?;
    if let Err(error) = refresh_cached_status(&summary, &state) {
        tracing::warn!(
            repo_id = %summary.repo_id,
            error = %error,
            "failed to refresh cached status after deleting unversioned file"
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn repo_branches(
    req: RepoBranchListRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<BranchList, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::list_branches(&summary)
}

#[tauri::command]
pub async fn repo_checkout(
    req: RepoCheckoutRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<CheckoutResult, crate::model::RepoError> {
    let summary = {
        let guard = state
            .lock()
            .map_err(|_| crate::model::RepoError::GitError {
                message: "state lock failed".to_string(),
            })?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| crate::model::RepoError::GitError {
        message: "unknown repo id".to_string(),
    })?;

    let summary_for_job = summary.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        git::checkout_branch(&summary_for_job, &req.target)
    })
    .await
    .map_err(|_| crate::model::RepoError::GitError {
        message: "checkout job failed".to_string(),
    })??;

    // Update cached status after checkout so UI refreshes quickly.
    if let Ok(mut status) = git::status(&summary) {
        if let Ok(mut cl_state) = changelist::load_state(&summary) {
            let _ = changelist::apply_to_status(&summary, &mut cl_state, &mut status);
        }
        if let Ok(mut guard) = state.lock() {
            guard.set_status(status);
        }
    }

    Ok(result)
}

#[tauri::command]
pub async fn repo_create_branch(
    req: RepoCreateBranchRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<BranchCreateResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    git::create_branch(&summary, &req.name, req.from.as_deref())?;
    Ok(BranchCreateResult { name: req.name })
}

#[tauri::command]
pub async fn repo_fetch(
    req: RepoFetchRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<crate::model::FetchResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let remote = req.remote.clone().unwrap_or_else(|| "origin".to_string());
    let updated = git::fetch(&summary, req.remote.as_deref())?;
    Ok(crate::model::FetchResult { remote, updated })
}

#[tauri::command]
pub async fn repo_pull(
    req: RepoFetchRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<crate::model::FetchResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let remote_arg = req.remote.clone();
    let remote = remote_arg
        .clone()
        .unwrap_or_else(|| "tracking branch".to_string());
    let summary_for_job = summary.clone();
    let updated = tauri::async_runtime::spawn_blocking(move || {
        git::pull(&summary_for_job, remote_arg.as_deref())
    })
    .await
    .map_err(|_| "pull job failed".to_string())??;

    if let Err(error) = refresh_cached_status(&summary, &state) {
        tracing::warn!(
            repo_id = %summary.repo_id,
            error = %error,
            "failed to refresh cached status after pull"
        );
    }
    Ok(crate::model::FetchResult { remote, updated })
}

#[tauri::command]
pub async fn repo_push(
    req: RepoFetchRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<crate::model::FetchResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    let remote_arg = req.remote.clone();
    let remote = remote_arg
        .clone()
        .unwrap_or_else(|| "tracking branch".to_string());
    let summary_for_job = summary.clone();
    let updated = tauri::async_runtime::spawn_blocking(move || {
        git::push(&summary_for_job, remote_arg.as_deref())
    })
    .await
    .map_err(|_| "push job failed".to_string())??;
    Ok(crate::model::FetchResult { remote, updated })
}

#[tauri::command]
pub async fn cl_list(
    req: RepoStatusRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<ChangelistState, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::load_state(&summary)
}

#[tauri::command]
pub async fn cl_create(
    req: ChangelistCreateRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<Changelist, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::create(&summary, &req.name)
}

#[tauri::command]
pub async fn cl_rename(
    req: ChangelistRenameRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::rename(&summary, &req.id, &req.name)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_delete(
    req: ChangelistIdRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::delete(&summary, &req.id)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_set_active(
    req: ChangelistIdRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::set_active(&summary, &req.id)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_assign_files(
    req: ChangelistAssignRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::assign_files(&summary, &req.changelist_id, &req.paths)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_unassign_files(
    req: ChangelistUnassignRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::unassign_files(&summary, &req.paths)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_assign_hunks(
    req: ChangelistAssignHunksRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::assign_hunks(&summary, &req.changelist_id, &req.path, &req.hunks)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn cl_unassign_hunks(
    req: ChangelistUnassignHunksRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    changelist::unassign_hunks(&summary, &req.path, &req.hunk_ids)?;
    update_cached_changelists(&summary, &state)?;
    Ok(())
}

#[tauri::command]
pub async fn commit_prepare(
    req: CommitPrepareRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<CommitPreview, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;
    build_commit_preview(&summary, &req.changelist_id)
}

#[tauri::command]
pub async fn commit_execute(
    req: CommitExecuteRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<CommitResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;

    let preview = build_commit_preview(&summary, &req.changelist_id)?;
    if !preview.invalid_hunks.is_empty() {
        return Err("Some hunks need reselect before committing.".to_string());
    }
    let options = req.options;
    let message = req.message.clone();
    let files = preview.files.clone();
    let hunk_files = collect_hunk_files(&summary, &req.changelist_id)?;
    let summary_for_job = summary.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        if hunk_files.is_empty() {
            git::commit_changelist(&summary_for_job, &files, &message, &options)
        } else {
            let full_files: Vec<_> = files
                .iter()
                .filter(|file| file.changelist_partial != Some(true))
                .cloned()
                .collect();
            git::commit_changelist_with_hunks(
                &summary_for_job,
                &full_files,
                &hunk_files,
                &message,
                &options,
            )
        }
    })
    .await
    .map_err(|_| "commit job failed".to_string())??;

    let mut status = git::status(&summary)?;
    if let Ok(mut cl_state) = changelist::load_state(&summary) {
        let _ = changelist::apply_to_status(&summary, &mut cl_state, &mut status);
    }

    let dirty_paths: std::collections::HashSet<String> =
        status.files.iter().map(|file| file.path.clone()).collect();
    let clean_paths: Vec<String> = result
        .committed_paths
        .iter()
        .filter(|path| !dirty_paths.contains(*path))
        .cloned()
        .collect();
    changelist::clear_assignments(&summary, &clean_paths)?;
    if let Ok(mut guard) = state.lock() {
        guard.set_status(status);
    }
    update_cached_changelists(&summary, &state)?;

    Ok(result)
}

#[tauri::command]
pub async fn commit_staged(
    req: CommitStagedRequest,
    state: State<'_, Mutex<AppState>>,
) -> Result<CommitResult, String> {
    let summary = {
        let guard = state.lock().map_err(|_| "state lock failed".to_string())?;
        guard.get_repo(&req.repo_id)
    };
    let summary = summary.ok_or_else(|| "unknown repo id".to_string())?;

    let status = git::status(&summary)?;
    let staged_files: Vec<_> = status
        .files
        .into_iter()
        .filter(|file| {
            matches!(
                file.status,
                crate::model::StatusKind::Staged | crate::model::StatusKind::Both
            )
        })
        .collect();
    let staged_paths: std::collections::HashSet<String> =
        staged_files.iter().map(|file| file.path.clone()).collect();
    let staged_old_paths: std::collections::HashMap<String, String> = staged_files
        .iter()
        .filter_map(|file| {
            file.old_path
                .as_ref()
                .map(|old_path| (file.path.clone(), old_path.clone()))
        })
        .collect();

    let mut selected_paths = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for raw_path in req.paths {
        let path = raw_path.trim();
        if path.is_empty() {
            continue;
        }
        if seen.insert(path.to_string()) {
            selected_paths.push(path.to_string());
        }
    }

    if selected_paths.is_empty() {
        return Err("Select at least one staged file to commit.".to_string());
    }

    let not_staged: Vec<String> = selected_paths
        .iter()
        .filter(|path| !staged_paths.contains(*path))
        .cloned()
        .collect();
    if !not_staged.is_empty() {
        if not_staged.len() == 1 {
            return Err(format!(
                "Selected file is no longer staged: {}",
                not_staged[0]
            ));
        }
        return Err("Some selected files are no longer staged. Refresh and try again.".to_string());
    }

    let mut paths_for_job = selected_paths.clone();
    for path in &selected_paths {
        if let Some(old_path) = staged_old_paths.get(path) {
            if !paths_for_job.contains(old_path) {
                paths_for_job.push(old_path.clone());
            }
        }
    }

    let options = req.options;
    let message = req.message.clone();
    let summary_for_job = summary.clone();
    let mut result = tauri::async_runtime::spawn_blocking(move || {
        git::commit_staged_paths(&summary_for_job, &paths_for_job, &message, &options)
    })
    .await
    .map_err(|_| "commit job failed".to_string())??;
    result.committed_paths = selected_paths.clone();

    let mut next_status = git::status(&summary)?;
    if let Ok(mut cl_state) = changelist::load_state(&summary) {
        let _ = changelist::apply_to_status(&summary, &mut cl_state, &mut next_status);
    }

    let dirty_paths: std::collections::HashSet<String> = next_status
        .files
        .iter()
        .map(|file| file.path.clone())
        .collect();
    let clean_paths: Vec<String> = result
        .committed_paths
        .iter()
        .filter(|path| !dirty_paths.contains(*path))
        .cloned()
        .collect();
    changelist::clear_assignments(&summary, &clean_paths)?;

    if let Ok(mut guard) = state.lock() {
        guard.set_status(next_status);
    }
    update_cached_changelists(&summary, &state)?;

    Ok(result)
}

fn update_cached_changelists(
    summary: &RepoSummary,
    state: &State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    let cached = guard.get_status(&summary.repo_id);
    if let Some(mut cached) = cached {
        if let Ok(mut cl_state) = changelist::load_state(summary) {
            let _ = changelist::apply_to_status(summary, &mut cl_state, &mut cached.status);
            guard.set_status(cached.status);
        }
    }
    Ok(())
}

fn refresh_cached_status(
    summary: &RepoSummary,
    state: &State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    let mut status = git::status(summary)?;
    if let Ok(mut cl_state) = changelist::load_state(summary) {
        let _ = changelist::apply_to_status(summary, &mut cl_state, &mut status);
    }

    let mut guard = state.lock().map_err(|_| "state lock failed".to_string())?;
    guard.set_status(status);
    Ok(())
}

fn build_commit_preview(
    summary: &RepoSummary,
    changelist_id: &str,
) -> Result<CommitPreview, String> {
    let mut status = git::status(summary)?;
    let mut cl_state = changelist::load_state(summary)?;
    if !cl_state.lists.iter().any(|item| item.id == changelist_id) {
        return Err("unknown changelist id".to_string());
    }
    let _ = changelist::apply_to_status(summary, &mut cl_state, &mut status);

    let files: Vec<_> = status
        .files
        .into_iter()
        .filter(|file| file.changelist_id.as_deref() == Some(changelist_id))
        .collect();
    let hunk_files = cl_state
        .hunk_assignments
        .iter()
        .filter(|(_, assignment)| assignment.changelist_id == changelist_id)
        .map(|(path, _)| path.clone())
        .collect::<Vec<_>>();
    preview_from_files(
        summary,
        changelist_id,
        files,
        hunk_files,
        &cl_state.hunk_assignments,
    )
}

fn preview_from_files(
    summary: &RepoSummary,
    changelist_id: &str,
    files: Vec<crate::model::StatusFile>,
    hunk_files: Vec<String>,
    hunk_assignments: &std::collections::HashMap<String, crate::model::HunkAssignmentSet>,
) -> Result<CommitPreview, String> {
    if files.is_empty() && hunk_files.is_empty() {
        return Err("Changelist has no files.".to_string());
    }
    if files
        .iter()
        .any(|file| matches!(file.status, crate::model::StatusKind::Conflicted))
    {
        return Err("Changelist contains conflicted files.".to_string());
    }

    let mut stats = crate::model::RepoCounts {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };
    let mut warnings = Vec::new();
    let mut has_mixed = false;
    let mut invalid_hunks: Vec<HunkAssignment> = Vec::new();
    let file_status: std::collections::HashMap<String, crate::model::StatusKind> = files
        .iter()
        .map(|file| (file.path.clone(), file.status.clone()))
        .collect();

    for file in &files {
        match file.status {
            crate::model::StatusKind::Staged => stats.staged += 1,
            crate::model::StatusKind::Unstaged => stats.unstaged += 1,
            crate::model::StatusKind::Both => {
                stats.staged += 1;
                stats.unstaged += 1;
                has_mixed = true;
            }
            crate::model::StatusKind::Untracked => stats.untracked += 1,
            crate::model::StatusKind::Conflicted => stats.conflicted += 1,
        }
    }

    for (path, assignment) in hunk_assignments {
        if assignment.changelist_id != changelist_id {
            continue;
        }
        if let Some(status) = file_status.get(path) {
            if assignment
                .hunks
                .iter()
                .any(|hunk| hunk.kind == crate::model::RepoDiffKind::Unstaged)
                && matches!(
                    status,
                    crate::model::StatusKind::Staged | crate::model::StatusKind::Both
                )
            {
                invalid_hunks.extend(assignment.hunks.clone());
                warnings.push(
                    "Unstaged hunks cannot be committed while staged changes exist in the same file."
                        .to_string(),
                );
                continue;
            }
        }

        let mut invalid_for_file = Vec::new();
        for hunk in &assignment.hunks {
            let hunks = git::diff_hunks_for_path(summary, path, hunk.kind.clone())?;
            let found = hunks
                .iter()
                .any(|diff| diff.id == hunk.id && diff.content_hash == hunk.content_hash);
            if !found {
                invalid_for_file.push(hunk.clone());
            }
        }
        if !invalid_for_file.is_empty() {
            invalid_hunks.extend(invalid_for_file);
            warnings.push("Some hunks no longer match the file. Reselect required.".to_string());
        }
    }

    if has_mixed {
        warnings.push(
            "Some files have both staged and unstaged changes; the commit will use the working tree version.".to_string(),
        );
    }

    Ok(CommitPreview {
        changelist_id: changelist_id.to_string(),
        files,
        stats,
        warnings,
        hunk_files,
        invalid_hunks,
    })
}

fn collect_hunk_files(
    summary: &RepoSummary,
    changelist_id: &str,
) -> Result<Vec<(String, Vec<HunkAssignment>)>, String> {
    let state = changelist::load_state(summary)?;
    let mut result = Vec::new();
    for (path, assignment) in state.hunk_assignments {
        if assignment.changelist_id != changelist_id {
            continue;
        }
        result.push((path, assignment.hunks));
    }
    Ok(result)
}

fn filter_hunks_for_path(hunks: Vec<DiffHunk>, path: &str) -> Vec<DiffHunk> {
    let normalized = normalize_repo_path(path);
    hunks
        .into_iter()
        .filter(|hunk| normalize_repo_path(&hunk.path) == normalized)
        .collect()
}

fn normalize_repo_path(path: &str) -> String {
    path.replace('\\', "/").trim_start_matches("./").to_string()
}

#[cfg(test)]
mod tests {
    use super::preview_from_files;
    use crate::model::{HunkAssignmentSet, RepoSummary, StatusFile, StatusKind};

    #[test]
    fn preview_rejects_conflicts() {
        let files = vec![StatusFile {
            path: "src/main.rs".to_string(),
            status: StatusKind::Conflicted,
            old_path: None,
            changelist_id: Some("default".to_string()),
            changelist_name: Some("Default".to_string()),
            changelist_partial: None,
        }];

        let summary = RepoSummary {
            repo_id: "test".to_string(),
            path: "test".to_string(),
            name: "test".to_string(),
            repo_root: "test".to_string(),
            worktree_path: "test".to_string(),
            is_valid: true,
        };
        let result = preview_from_files(
            &summary,
            "default",
            files,
            Vec::new(),
            &std::collections::HashMap::<String, HunkAssignmentSet>::new(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn preview_counts_files() {
        let files = vec![
            StatusFile {
                path: "src/a.rs".to_string(),
                status: StatusKind::Staged,
                old_path: None,
                changelist_id: Some("default".to_string()),
                changelist_name: Some("Default".to_string()),
                changelist_partial: None,
            },
            StatusFile {
                path: "src/b.rs".to_string(),
                status: StatusKind::Untracked,
                old_path: None,
                changelist_id: Some("default".to_string()),
                changelist_name: Some("Default".to_string()),
                changelist_partial: None,
            },
        ];

        let summary = RepoSummary {
            repo_id: "test".to_string(),
            path: "test".to_string(),
            name: "test".to_string(),
            repo_root: "test".to_string(),
            worktree_path: "test".to_string(),
            is_valid: true,
        };
        let preview = preview_from_files(
            &summary,
            "default",
            files,
            Vec::new(),
            &std::collections::HashMap::<String, HunkAssignmentSet>::new(),
        )
        .expect("preview");
        assert_eq!(preview.stats.staged, 1);
        assert_eq!(preview.stats.untracked, 1);
    }
}
