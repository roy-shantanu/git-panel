use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::model::{RepoId, RepoListItem, RepoStatus, RepoSummary};

#[derive(Default)]
pub struct AppState {
    recent: Vec<RepoListItem>,
    repos: HashMap<RepoId, RepoSummary>,
    status_cache: HashMap<RepoId, RepoStatus>,
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
        self.status_cache.insert(status.repo_id.clone(), status);
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

