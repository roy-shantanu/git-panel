use serde::{Deserialize, Serialize};

pub type RepoId = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoOpenRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatusRequest {
    pub repo_id: RepoId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    pub repo_id: RepoId,
    pub path: String,
    pub name: String,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoStatus {
    pub repo_id: RepoId,
    pub branch: String,
    pub staged: u32,
    pub changed: u32,
    pub untracked: u32,
    pub ahead: u32,
    pub behind: u32,
    pub last_updated: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoListItem {
    pub repo_id: RepoId,
    pub path: String,
    pub name: String,
    pub last_opened: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppVersion {
    pub version: String,
}

