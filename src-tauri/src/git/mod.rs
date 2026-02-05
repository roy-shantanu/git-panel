use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

use crate::model::{RepoId, RepoStatus, RepoSummary};
use crate::store::now_ts;

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

pub fn status(summary: &RepoSummary) -> RepoStatus {
    RepoStatus {
        repo_id: summary.repo_id.clone(),
        branch: "main".to_string(),
        staged: 0,
        changed: 0,
        untracked: 0,
        ahead: 0,
        behind: 0,
        last_updated: now_ts(),
    }
}

fn repo_id_for_path(path: &str) -> RepoId {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:x}", hasher.finish())
}

