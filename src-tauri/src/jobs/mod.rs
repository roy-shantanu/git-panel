use std::collections::HashMap;

use crate::model::RepoId;

#[derive(Default)]
pub struct JobQueue {
    next_token: u64,
    current: HashMap<RepoId, u64>,
}

impl JobQueue {
    pub fn new() -> Self {
        Self::default()
    }

    /// Starts a new status job for a repo and returns its token.
    /// Any previous job becomes stale and its results should be ignored.
    pub fn start_status(&mut self, repo_id: &RepoId) -> u64 {
        self.next_token = self.next_token.wrapping_add(1);
        let token = self.next_token;
        self.current.insert(repo_id.clone(), token);
        token
    }

    pub fn is_current(&self, repo_id: &RepoId, token: u64) -> bool {
        self.current.get(repo_id).copied() == Some(token)
    }
}
