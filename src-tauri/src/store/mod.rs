use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::jobs::JobQueue;
use crate::model::{RepoId, RepoListItem, RepoStatus, RepoSummary};

#[derive(Clone)]
pub struct CachedStatus {
    pub status: RepoStatus,
    pub updated_at_ms: u64,
}

#[derive(Default)]
pub struct AppState {
    recent: Vec<RepoListItem>,
    repos: HashMap<RepoId, RepoSummary>,
    status_cache: HashMap<RepoId, CachedStatus>,
    pub job_queue: JobQueue,
}

impl AppState {
    pub fn upsert_repo(&mut self, summary: RepoSummary) -> RepoSummary {
        self.touch_recent(&summary);
        self.repos.insert(summary.repo_id.clone(), summary.clone());
        summary
    }

    pub fn get_repo(&self, repo_id: &RepoId) -> Option<RepoSummary> {
        self.repos.get(repo_id).cloned()
    }

    pub fn list_recent(&self) -> Vec<RepoListItem> {
        self.recent.clone()
    }

    pub fn set_status(&mut self, status: RepoStatus) {
        self.status_cache.insert(
            status.repo_id.clone(),
            CachedStatus {
                status,
                updated_at_ms: now_ms(),
            },
        );
    }

    pub fn get_status(&self, repo_id: &RepoId) -> Option<CachedStatus> {
        self.status_cache.get(repo_id).cloned()
    }

    fn touch_recent(&mut self, summary: &RepoSummary) {
        let now = now_ts();
        self.recent.retain(|item| item.repo_id != summary.repo_id);
        self.recent.insert(
            0,
            RepoListItem {
                repo_id: summary.repo_id.clone(),
                path: summary.path.clone(),
                name: summary.name.clone(),
                last_opened: now,
            },
        );
        if self.recent.len() > 20 {
            self.recent.truncate(20);
        }
    }
}

pub fn now_ts() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}
