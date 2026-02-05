use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use git2::{
    build::CheckoutBuilder, BranchType, DiffFormat, DiffOptions, FetchOptions, ObjectType,
    RemoteCallbacks, Repository, Status, StatusOptions,
};

use crate::model::{
    BranchList, CheckoutResult, CheckoutTarget, CheckoutTargetKind, CommitOptions, CommitResult,
    DiffHunk, HunkAssignment, RepoCounts, RepoDiffKind, RepoError, RepoHead, RepoId, RepoStatus,
    RepoSummary, StatusFile, StatusKind, UnifiedDiffText,
};
use crate::model::{WorktreeInfo, WorktreeList, WorktreeResult};

pub fn commit_changelist(
    summary: &RepoSummary,
    files: &[StatusFile],
    message: &str,
    options: &CommitOptions,
) -> Result<CommitResult, String> {
    if files.is_empty() {
        return Err("No files to commit.".to_string());
    }
    if message.trim().is_empty() {
        return Err("Commit message is required.".to_string());
    }

    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let git_dir = repo.path();
    let tmp_dir = git_dir.join("gitpanel").join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "clock error".to_string())?
        .as_millis();
    let index_path = tmp_dir.join(format!("index-{millis}"));

    let head_oid = run_git(&summary.path, &["rev-parse", "--verify", "HEAD"], None).ok();
    let head_oid = head_oid.map(|value| value.trim().to_string());

    let index_env = Some(("GIT_INDEX_FILE", index_path.to_string_lossy().to_string()));

    if head_oid.is_some() {
        run_git(
            &summary.path,
            &["read-tree", "HEAD"],
            index_env.as_ref(),
        )?;
    } else {
        run_git(
            &summary.path,
            &["read-tree", "--empty"],
            index_env.as_ref(),
        )?;
    }

    let mut args = vec!["add", "-A", "--"];
    for file in files {
        if matches!(file.status, StatusKind::Conflicted) {
            return Err("Changelist contains conflicted files.".to_string());
        }
        args.push(&file.path);
    }
    run_git(&summary.path, &args, index_env.as_ref())?;

    let tree_oid = run_git(&summary.path, &["write-tree"], index_env.as_ref())?;
    let tree_oid = tree_oid.trim();

    let commit_oid = if options.amend {
        let head_oid = head_oid.clone().ok_or_else(|| "Cannot amend without existing commits.".to_string())?;
        let parents_line =
            run_git(&summary.path, &["rev-list", "--parents", "-n", "1", "HEAD"], None)?;
        let mut parts = parents_line.split_whitespace();
        let _ = parts.next();
        let parents: Vec<&str> = parts.collect();

        let mut commit_args = vec!["commit-tree", tree_oid, "-m", message];
        for parent in parents {
            commit_args.push("-p");
            commit_args.push(parent);
        }
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, &head_oid, new_oid.trim())?;
        new_oid.trim().to_string()
    } else if let Some(head_oid) = head_oid.clone() {
        let commit_args = ["commit-tree", tree_oid, "-m", message, "-p", head_oid.as_str()];
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, &head_oid, new_oid.trim())?;
        new_oid.trim().to_string()
    } else {
        let commit_args = ["commit-tree", tree_oid, "-m", message];
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, "", new_oid.trim())?;
        new_oid.trim().to_string()
    };

    let _ = std::fs::remove_file(&index_path);

    let head = repo_head(&repo)?;
    Ok(CommitResult {
        head,
        commit_id: commit_oid,
        committed_paths: files.iter().map(|file| file.path.clone()).collect(),
    })
}

pub fn commit_changelist_with_hunks(
    summary: &RepoSummary,
    full_files: &[StatusFile],
    hunk_files: &[(String, Vec<HunkAssignment>)],
    message: &str,
    options: &CommitOptions,
) -> Result<CommitResult, String> {
    if full_files.is_empty() && hunk_files.is_empty() {
        return Err("No files to commit.".to_string());
    }
    if message.trim().is_empty() {
        return Err("Commit message is required.".to_string());
    }

    let repo = Repository::open(&summary.path).map_err(|e| e.to_string())?;
    let git_dir = repo.path();
    let tmp_dir = git_dir.join("gitpanel").join("tmp");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "clock error".to_string())?
        .as_millis();
    let index_path = tmp_dir.join(format!("index-{millis}"));

    let head_oid = run_git(&summary.path, &["rev-parse", "--verify", "HEAD"], None).ok();
    let head_oid = head_oid.map(|value| value.trim().to_string());

    let index_env = Some(("GIT_INDEX_FILE", index_path.to_string_lossy().to_string()));

    if head_oid.is_some() {
        run_git(&summary.path, &["read-tree", "HEAD"], index_env.as_ref())?;
    } else {
        run_git(
            &summary.path,
            &["read-tree", "--empty"],
            index_env.as_ref(),
        )?;
    }

    if !full_files.is_empty() {
        let mut args = vec!["add", "-A", "--"];
        for file in full_files {
            if matches!(file.status, StatusKind::Conflicted) {
                return Err("Changelist contains conflicted files.".to_string());
            }
            args.push(&file.path);
        }
        run_git(&summary.path, &args, index_env.as_ref())?;
    }

    for (path, hunks) in hunk_files {
        let patch = build_hunk_patch(summary, path, hunks)?;
        let patch_path = tmp_dir.join(format!("patch-{millis}-{}.diff", sanitize_path(path)));
        std::fs::write(&patch_path, patch).map_err(|e| e.to_string())?;
        let patch_path_str = patch_path.to_string_lossy().to_string();
        let args = ["apply", "--cached", patch_path_str.as_str()];
        run_git(&summary.path, &args, index_env.as_ref())?;
        let _ = std::fs::remove_file(&patch_path);
    }

    let tree_oid = run_git(&summary.path, &["write-tree"], index_env.as_ref())?;
    let tree_oid = tree_oid.trim();

    let commit_oid = if options.amend {
        let head_oid = head_oid
            .clone()
            .ok_or_else(|| "Cannot amend without existing commits.".to_string())?;
        let parents_line =
            run_git(&summary.path, &["rev-list", "--parents", "-n", "1", "HEAD"], None)?;
        let mut parts = parents_line.split_whitespace();
        let _ = parts.next();
        let parents: Vec<&str> = parts.collect();

        let mut commit_args = vec!["commit-tree", tree_oid, "-m", message];
        for parent in parents {
            commit_args.push("-p");
            commit_args.push(parent);
        }
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, &head_oid, new_oid.trim())?;
        new_oid.trim().to_string()
    } else if let Some(head_oid) = head_oid.clone() {
        let commit_args = ["commit-tree", tree_oid, "-m", message, "-p", head_oid.as_str()];
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, &head_oid, new_oid.trim())?;
        new_oid.trim().to_string()
    } else {
        let commit_args = ["commit-tree", tree_oid, "-m", message];
        let new_oid = run_git(&summary.path, &commit_args, None)?;
        update_ref(&summary.path, "", new_oid.trim())?;
        new_oid.trim().to_string()
    };

    let _ = std::fs::remove_file(&index_path);

    let head = repo_head(&repo)?;
    let mut committed_paths: Vec<String> =
        full_files.iter().map(|file| file.path.clone()).collect();
    committed_paths.extend(hunk_files.iter().map(|(path, _)| path.clone()));

    Ok(CommitResult {
        head,
        commit_id: commit_oid,
        committed_paths,
    })
}

fn run_git(
    repo_path: &str,
    args: &[&str],
    env: Option<&(&str, String)>,
) -> Result<String, String> {
    let mut command = Command::new("git");
    command.arg("-C").arg(repo_path).args(args);
    if let Some((key, value)) = env {
        command.env(key, value);
    }
    let output = command.output().map_err(|e| e.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let message = if stderr.is_empty() { stdout } else { stderr };
        return Err(if message.is_empty() {
            "git command failed".to_string()
        } else {
            message
        });
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn build_hunk_patch(
    summary: &RepoSummary,
    path: &str,
    hunks: &[HunkAssignment],
) -> Result<String, String> {
    if hunks.is_empty() {
        return Err("no hunks provided".to_string());
    }

    let kind = hunks[0].kind.clone();
    if hunks.iter().any(|h| h.kind != kind) {
        return Err("mixed hunk kinds not supported for one file".to_string());
    }

    let all_hunks = diff_hunks_for_path(summary, path, kind)?;
    let mut lookup = std::collections::HashMap::new();
    for hunk in all_hunks {
        lookup.insert(hunk.id.clone(), hunk);
    }

    let mut file_header = String::new();
    let mut patch = String::new();
    for hunk in hunks {
        let diff = lookup
            .get(&hunk.id)
            .ok_or_else(|| format!("hunk {} not found", hunk.id))?;
        if diff.content_hash != hunk.content_hash {
            return Err("hunk content changed; reselect required".to_string());
        }
        if file_header.is_empty() {
            file_header = diff.file_header.clone();
            if !file_header.ends_with('\n') {
                file_header.push('\n');
            }
            patch.push_str(&file_header);
        }
        patch.push_str(&diff.header);
        patch.push('\n');
        patch.push_str(&diff.content);
        if !diff.content.ends_with('\n') {
            patch.push('\n');
        }
    }

    Ok(patch)
}

fn sanitize_path(path: &str) -> String {
    path.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

fn update_ref(repo_path: &str, old_oid: &str, new_oid: &str) -> Result<(), String> {
    let head_ref = run_git(repo_path, &["symbolic-ref", "-q", "HEAD"], None)
        .ok()
        .map(|value| value.trim().to_string());

    if let Some(reference) = head_ref {
        if old_oid.is_empty() {
            run_git(repo_path, &["update-ref", &reference, new_oid], None)?;
        } else {
            run_git(repo_path, &["update-ref", &reference, new_oid, old_oid], None)?;
        }
    } else if old_oid.is_empty() {
        run_git(repo_path, &["update-ref", "HEAD", new_oid], None)?;
    } else {
        run_git(repo_path, &["update-ref", "HEAD", new_oid, old_oid], None)?;
    }
    Ok(())
}

pub fn open_repo(path: &str) -> RepoSummary {
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("Unknown")
        .to_string();

    let repo_root = run_git(path, &["rev-parse", "--show-toplevel"], None)
        .ok()
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| path.to_string());

    let worktree_path = repo_root.clone();

    let is_valid = Path::new(path).join(".git").exists()
        || Path::new(path).join(".git").is_file()
        || Path::new(&repo_root).join(".git").exists();
    RepoSummary {
        repo_id: repo_id_for_path(&worktree_path),
        path: path.to_string(),
        name,
        repo_root,
        worktree_path,
        is_valid,
    }
}

pub fn resolve_git_dir(worktree_path: &str) -> PathBuf {
    let dot_git = Path::new(worktree_path).join(".git");
    if dot_git.is_dir() {
        return dot_git;
    }
    if dot_git.is_file() {
        if let Ok(content) = std::fs::read_to_string(&dot_git) {
            if let Some(rest) = content.trim().strip_prefix("gitdir:") {
                let git_dir = rest.trim();
                let git_path = Path::new(git_dir);
                if git_path.is_absolute() {
                    return git_path.to_path_buf();
                }
                return Path::new(worktree_path).join(git_path);
            }
        }
    }
    dot_git
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
                changelist_id: None,
                changelist_name: None,
                changelist_partial: None,
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

pub fn diff_hunks_for_path(
    summary: &RepoSummary,
    path: &str,
    kind: RepoDiffKind,
) -> Result<Vec<DiffHunk>, String> {
    let diff = diff_for_path(summary, path, kind.clone())?;
    Ok(parse_diff_hunks(&diff.text, path, kind))
}

pub fn diff_hunks_from_text(
    diff_text: &str,
    path: &str,
    kind: RepoDiffKind,
) -> Vec<DiffHunk> {
    parse_diff_hunks(diff_text, path, kind)
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

    if let Ok(iter) = repo.branches(Some(BranchType::Local)) {
        for item in iter.flatten() {
            if let Ok(Some(name)) = item.0.name() {
                locals.push(name.to_string());
            }
        }
    }

    if let Ok(iter) = repo.branches(Some(BranchType::Remote)) {
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

pub fn list_worktrees(repo_root: &str) -> Result<WorktreeList, String> {
    let output = run_git(repo_root, &["worktree", "list", "--porcelain"], None)?;
    let mut worktrees = Vec::new();
    let mut current_path = None;
    let mut current_head = None;
    let mut current_branch = None;

    for line in output.lines() {
        if line.starts_with("worktree ") {
            if let Some(path) = current_path.take() {
                worktrees.push(WorktreeInfo {
                    path,
                    head: current_head.take().unwrap_or_else(|| "unknown".to_string()),
                    branch: current_branch.take().unwrap_or_else(|| "DETACHED".to_string()),
                });
            }
            current_path = Some(line.trim_start_matches("worktree ").trim().to_string());
        } else if line.starts_with("HEAD ") {
            current_head = Some(line.trim_start_matches("HEAD ").trim().to_string());
        } else if line.starts_with("branch ") {
            let branch = line.trim_start_matches("branch ").trim().to_string();
            current_branch = Some(branch.trim_start_matches("refs/heads/").to_string());
        }
    }

    if let Some(path) = current_path.take() {
        worktrees.push(WorktreeInfo {
            path,
            head: current_head.take().unwrap_or_else(|| "unknown".to_string()),
            branch: current_branch.take().unwrap_or_else(|| "DETACHED".to_string()),
        });
    }

    Ok(WorktreeList {
        repo_root: repo_root.to_string(),
        worktrees,
    })
}

pub fn add_worktree(
    repo_root: &str,
    path: &str,
    branch_name: &str,
    new_branch: bool,
) -> Result<WorktreeResult, String> {
    let mut args = vec!["worktree", "add"];
    if new_branch {
        args.push("-b");
        args.push(branch_name);
        args.push(path);
        args.push("HEAD");
    } else {
        args.push(path);
        args.push(branch_name);
    }
    run_git(repo_root, &args, None)?;
    Ok(WorktreeResult {
        ok: true,
        message: "worktree added".to_string(),
    })
}

pub fn remove_worktree(repo_root: &str, path: &str) -> Result<WorktreeResult, String> {
    run_git(repo_root, &["worktree", "remove", path], None)?;
    Ok(WorktreeResult {
        ok: true,
        message: "worktree removed".to_string(),
    })
}

pub fn prune_worktrees(repo_root: &str) -> Result<WorktreeResult, String> {
    run_git(repo_root, &["worktree", "prune"], None)?;
    Ok(WorktreeResult {
        ok: true,
        message: "worktrees pruned".to_string(),
    })
}

pub fn repo_id_for_path(path: &str) -> RepoId {
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

fn parse_diff_hunks(diff_text: &str, default_path: &str, kind: RepoDiffKind) -> Vec<DiffHunk> {
    let mut hunks = Vec::new();
    let lines: Vec<&str> = diff_text.lines().collect();
    let mut i = 0;
    let mut file_header: Vec<String> = Vec::new();
    let mut current_path: Option<String> = None;

    while i < lines.len() {
        let line = lines[i];
        if line.starts_with("diff --git ") {
            file_header.clear();
            file_header.push(line.to_string());
            current_path = extract_b_path(line);
            i += 1;
            continue;
        }

        if line.starts_with("@@ ") {
            let header = line.to_string();
            let (old_start, old_lines, new_start, new_lines) = parse_hunk_header(line);
            let mut content_lines: Vec<String> = Vec::new();
            i += 1;
            while i < lines.len() {
                let next = lines[i];
                if next.starts_with("diff --git ") || next.starts_with("@@ ") {
                    break;
                }
                content_lines.push(next.to_string());
                i += 1;
            }
            let content = content_lines.join("\n");
            let content_hash = hash_content(&content);
            let id = format!(
                "{}:{}:{}:{}:{}",
                old_start, old_lines, new_start, new_lines, content_hash
            );
            let file_header_text = file_header.join("\n");
            let path = current_path
                .clone()
                .unwrap_or_else(|| default_path.to_string());
            hunks.push(DiffHunk {
                path,
                kind: kind.clone(),
                id,
                header,
                old_start,
                old_lines,
                new_start,
                new_lines,
                content,
                content_hash,
                file_header: file_header_text,
            });
            continue;
        }

        if line.starts_with("index ")
            || line.starts_with("--- ")
            || line.starts_with("+++ ")
            || line.starts_with("new file mode")
            || line.starts_with("deleted file mode")
            || line.starts_with("similarity index")
            || line.starts_with("rename from")
            || line.starts_with("rename to")
        {
            file_header.push(line.to_string());
        }

        i += 1;
    }

    hunks
}

pub fn diff_cache_key(
    summary: &RepoSummary,
    path: &str,
    kind: RepoDiffKind,
) -> Result<String, String> {
    let old_oid = match kind {
        RepoDiffKind::Staged => run_git(&summary.path, &["rev-parse", &format!("HEAD:{path}")], None)
            .ok(),
        RepoDiffKind::Unstaged => {
            run_git(&summary.path, &["rev-parse", &format!(":{path}")], None).ok()
        }
    };

    let new_oid = match kind {
        RepoDiffKind::Staged => run_git(&summary.path, &["rev-parse", &format!(":{path}")], None)
            .ok(),
        RepoDiffKind::Unstaged => run_git(&summary.path, &["hash-object", path], None).ok(),
    };

    let old_oid = old_oid.map(|value| value.trim().to_string()).unwrap_or_else(|| "none".to_string());
    let new_oid = new_oid.map(|value| value.trim().to_string()).unwrap_or_else(|| "none".to_string());
    Ok(format!(
        "{}:{}:{}:{}",
        summary.repo_id, path, old_oid, new_oid
    ))
}

fn extract_b_path(line: &str) -> Option<String> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() >= 4 {
        let b = parts[3];
        return Some(b.trim_start_matches("b/").to_string());
    }
    None
}

fn parse_hunk_header(line: &str) -> (u32, u32, u32, u32) {
    let header = line.trim_start_matches("@@ ").trim_end_matches("@@");
    let mut parts = header.split(" @@").next().unwrap_or("").split_whitespace();
    let old_part = parts.next().unwrap_or("-0");
    let new_part = parts.next().unwrap_or("+0");
    let (old_start, old_lines) = parse_range(old_part.trim_start_matches('-'));
    let (new_start, new_lines) = parse_range(new_part.trim_start_matches('+'));
    (old_start, old_lines, new_start, new_lines)
}

fn parse_range(text: &str) -> (u32, u32) {
    let mut parts = text.split(',');
    let start = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let lines = parts
        .next()
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(1);
    (start, lines)
}

fn hash_content(text: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::{parse_diff_hunks, RepoDiffKind};

    #[test]
    fn hunk_id_changes_with_content() {
        let diff = "\
diff --git a/foo.txt b/foo.txt\n\
index 1111111..2222222 100644\n\
--- a/foo.txt\n\
+++ b/foo.txt\n\
@@ -1,2 +1,2 @@\n\
-hello\n\
+hello world\n\
 line2\n";

        let hunks = parse_diff_hunks(diff, "foo.txt", RepoDiffKind::Unstaged);
        assert_eq!(hunks.len(), 1);
        let first_id = hunks[0].id.clone();

        let diff_changed = "\
diff --git a/foo.txt b/foo.txt\n\
index 1111111..2222222 100644\n\
--- a/foo.txt\n\
+++ b/foo.txt\n\
@@ -1,2 +1,2 @@\n\
-hello\n\
+hello brave world\n\
 line2\n";
        let hunks_changed = parse_diff_hunks(diff_changed, "foo.txt", RepoDiffKind::Unstaged);
        assert_eq!(hunks_changed.len(), 1);
        assert_ne!(first_id, hunks_changed[0].id);
    }
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
