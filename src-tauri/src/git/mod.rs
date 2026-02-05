use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use git2::{
    build::CheckoutBuilder, BranchType, DiffFormat, DiffOptions, FetchOptions, ObjectType,
    RemoteCallbacks, Repository, Status, StatusOptions,
};

use crate::model::{
    BranchList, CheckoutResult, CheckoutTarget, CheckoutTargetKind, RepoCounts, RepoDiffKind,
    RepoError, RepoHead, RepoId, RepoStatus, RepoSummary, StatusFile, StatusKind, UnifiedDiffText,
};

pub fn open_repo(path: &str) -> RepoSummary {
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let is_valid = Path::new(path).join(".git").exists();
    RepoSummary {
        repo_id: repo_id_for_path(path),
        path: path.to_string(),
        name,
        is_valid,
    }
}

pub fn status(summary: &RepoSummary) -> Result<RepoStatus, String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let head = repo_head(&repo)?;

    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(false)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo.statuses(Some(&mut options)).map_err(|e| e.to_string())?;
    let mut files = Vec::new();
    let mut counts = RepoCounts {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0,
    };

    for entry in statuses.iter() {
        let status = entry.status();
        if status.is_empty() {
            continue;
        }

        let is_conflicted = status.contains(Status::CONFLICTED);
        let is_untracked = status.contains(Status::WT_NEW) && !status.contains(Status::INDEX_NEW);
        let staged = is_index_change(status);
        let unstaged = is_workdir_change(status);

        let kind = if is_conflicted {
            counts.conflicted += 1;
            StatusKind::Conflicted
        } else if is_untracked {
            counts.untracked += 1;
            StatusKind::Untracked
        } else if staged && unstaged {
            counts.staged += 1;
            counts.unstaged += 1;
            StatusKind::Both
        } else if staged {
            counts.staged += 1;
            StatusKind::Staged
        } else if unstaged {
            counts.unstaged += 1;
            StatusKind::Unstaged
        } else {
            continue;
        };

        let (path, old_path) = extract_paths(&entry);
        if let Some(path) = path {
            files.push(StatusFile {
                path,
                status: kind,
                old_path,
            });
        }
    }

    Ok(RepoStatus {
        repo_id: summary.repo_id.clone(),
        head,
        counts,
        files,
    })
}

pub fn diff_for_path(
    summary: &RepoSummary,
    path: &str,
    kind: RepoDiffKind,
) -> Result<UnifiedDiffText, String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let mut options = DiffOptions::new();
    options.pathspec(path);

    let diff = match kind {
        RepoDiffKind::Unstaged => {
            options.include_untracked(true).recurse_untracked_dirs(true);
            let index = repo.index().map_err(|e| e.to_string())?;
            repo.diff_index_to_workdir(Some(&index), Some(&mut options))
                .map_err(|e| e.to_string())?
        }
        RepoDiffKind::Staged => {
            let head = repo.head().ok();
            let tree = head
                .and_then(|head| head.peel(ObjectType::Tree).ok())
                .and_then(|obj| obj.into_tree().ok());
            let index = repo.index().map_err(|e| e.to_string())?;
            repo.diff_tree_to_index(tree.as_ref(), Some(&index), Some(&mut options))
                .map_err(|e| e.to_string())?
        }
    };

    let mut text = String::new();
    diff.print(DiffFormat::Patch, |_, _, line| {
        if let Ok(chunk) = std::str::from_utf8(line.content()) {
            text.push_str(chunk);
        }
        true
    })
    .map_err(|e| e.to_string())?;

    Ok(UnifiedDiffText { text })
}

pub fn stage_path(summary: &RepoSummary, path: &str) -> Result<(), String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let mut index = repo.index().map_err(|e| e.to_string())?;
    index
        .add_path(Path::new(path))
        .map_err(|e| e.to_string())?;
    index.write().map_err(|e| e.to_string())
}

pub fn unstage_path(summary: &RepoSummary, path: &str) -> Result<(), String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let head = repo.head().ok();
    if let Some(head) = head {
        let target = head
            .peel(ObjectType::Tree)
            .map_err(|e| e.to_string())?;
        repo.reset_default(Some(&target), [Path::new(path)])
            .map_err(|e| e.to_string())?;
    } else {
        let mut index = repo.index().map_err(|e| e.to_string())?;
        index
            .remove_path(Path::new(path))
            .map_err(|e| e.to_string())?;
        index.write().map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_branches(summary: &RepoSummary) -> Result<BranchList, String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let head = repo_head(&repo)?;
    let current = head.branch_name.clone();
    let mut locals = Vec::new();
    let mut remotes = Vec::new();

    if let Ok(mut iter) = repo.branches(Some(BranchType::Local)) {
        for item in iter.flatten() {
            if let Ok(Some(name)) = item.0.name() {
                locals.push(name.to_string());
            }
        }
    }

    if let Ok(mut iter) = repo.branches(Some(BranchType::Remote)) {
        for item in iter.flatten() {
            if let Ok(Some(name)) = item.0.name() {
                remotes.push(name.to_string());
            }
        }
    }

    locals.sort();
    remotes.sort();

    Ok(BranchList {
        current,
        locals,
        remotes,
        ahead_behind: None,
    })
}

pub fn checkout_branch(
    summary: &RepoSummary,
    target: &CheckoutTarget,
) -> Result<CheckoutResult, RepoError> {
    let repo = Repository::open(&summary.path).map_err(|e| RepoError::GitError {
        message: e.to_string(),
    })?;

    if is_workdir_dirty(&repo) {
        return Err(RepoError::DirtyWorkingTree {
            message: "Working tree has uncommitted changes.".to_string(),
        });
    }

    match target.kind {
        CheckoutTargetKind::Local => checkout_local(&repo, &target.name)?,
        CheckoutTargetKind::Remote => checkout_remote(&repo, &target.name)?,
    }

    let head = repo_head(&repo).map_err(|e| RepoError::GitError { message: e })?;
    Ok(CheckoutResult { head })
}

pub fn create_branch(
    summary: &RepoSummary,
    name: &str,
    from: Option<&str>,
) -> Result<(), String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let target = if let Some(from) = from {
        repo.revparse_single(from).map_err(|e| e.to_string())?
    } else {
        repo.head()
            .and_then(|h| h.peel(ObjectType::Commit))
            .map_err(|e| e.to_string())?
    };

    let commit = target
        .peel(ObjectType::Commit)
        .map_err(|e| e.to_string())?
        .into_commit()
        .map_err(|_| "not a commit".to_string())?;

    repo.branch(name, &commit, false)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn fetch(summary: &RepoSummary, remote: Option<&str>) -> Result<bool, String> {
    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let remote_name = remote.unwrap_or("origin");
    let mut remote = repo.find_remote(remote_name).map_err(|e| e.to_string())?;

    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(|_url, _username, _allowed| git2::Cred::default());

    let mut options = FetchOptions::new();
    options.remote_callbacks(callbacks);

    remote
        .fetch(&[] as &[&str], Some(&mut options), None)
        .map_err(|e| e.to_string())?;

    Ok(true)
}

fn repo_id_for_path(path: &str) -> RepoId {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

fn repo_head(repo: &Repository) -> Result<RepoHead, String> {
    match repo.head() {
        Ok(head) => {
            let branch_name = head
                .shorthand()
                .unwrap_or("DETACHED")
                .to_string();
            let oid_short = head
                .target()
                .map(|oid| oid.to_string())
                .map(|oid| oid.chars().take(7).collect::<String>())
                .unwrap_or_else(|| "unknown".to_string());

            Ok(RepoHead {
                branch_name,
                oid_short,
            })
        }
        Err(_) => Ok(RepoHead {
            branch_name: "NO-HEAD".to_string(),
            oid_short: "—".to_string(),
        }),
    }
}

fn is_index_change(status: Status) -> bool {
    status.intersects(
        Status::INDEX_NEW
            | Status::INDEX_MODIFIED
            | Status::INDEX_DELETED
            | Status::INDEX_RENAMED
            | Status::INDEX_TYPECHANGE,
    )
}

fn is_workdir_change(status: Status) -> bool {
    status.intersects(
        Status::WT_MODIFIED
            | Status::WT_DELETED
            | Status::WT_RENAMED
            | Status::WT_TYPECHANGE,
    )
}

fn extract_paths(entry: &git2::StatusEntry) -> (Option<String>, Option<String>) {
    let mut path: Option<PathBuf> = None;
    let mut old_path: Option<PathBuf> = None;

    if let Some(delta) = entry.head_to_index() {
        if let Some(new_file) = delta.new_file().path() {
            path = Some(new_file.to_path_buf());
        }
        if let Some(old_file) = delta.old_file().path() {
            old_path = Some(old_file.to_path_buf());
        }
    }

    if path.is_none() {
        if let Some(delta) = entry.index_to_workdir() {
            if let Some(new_file) = delta.new_file().path() {
                path = Some(new_file.to_path_buf());
            }
            if let Some(old_file) = delta.old_file().path() {
                old_path = Some(old_file.to_path_buf());
            }
        }
    }

    (
        path.map(|p| p.to_string_lossy().to_string()),
        old_path.map(|p| p.to_string_lossy().to_string()),
    )
}

fn is_workdir_dirty(repo: &Repository) -> bool {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_unmodified(false);
    if let Ok(statuses) = repo.statuses(Some(&mut options)) {
        statuses
            .iter()
            .any(|entry| !entry.status().is_empty() && entry.status() != Status::CURRENT)
    } else {
        false
    }
}

fn checkout_local(repo: &Repository, name: &str) -> Result<(), RepoError> {
    let obj = repo
        .revparse_single(&format!("refs/heads/{name}"))
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;
    let mut builder = CheckoutBuilder::new();
    repo.checkout_tree(&obj, Some(&mut builder))
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;
    repo.set_head(&format!("refs/heads/{name}"))
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;
    Ok(())
}

fn checkout_remote(repo: &Repository, name: &str) -> Result<(), RepoError> {
    let obj = repo.revparse_single(&format!("refs/remotes/{name}")).map_err(|e| {
        RepoError::GitError {
            message: e.to_string(),
        }
    })?;

    let mut branch_name = name.to_string();
    if let Some((_remote, short)) = name.split_once('/') {
        branch_name = short.to_string();
    }

    let commit = obj
        .peel(ObjectType::Commit)
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?
        .into_commit()
        .map_err(|_| RepoError::GitError {
            message: "not a commit".to_string(),
        })?;

    repo.branch(&branch_name, &commit, false)
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;

    let mut builder = CheckoutBuilder::new();
    repo.checkout_tree(&obj, Some(&mut builder))
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;
    repo.set_head(&format!("refs/heads/{branch_name}"))
        .map_err(|e| RepoError::GitError {
            message: e.to_string(),
        })?;
    Ok(())
}
