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
pub struct RepoDiffRequest {
    pub repo_id: RepoId,
    pub path: String,
    pub kind: RepoDiffKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RepoDiffKind {
    Unstaged,
    Staged,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoPathRequest {
    pub repo_id: RepoId,
    pub path: String,
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
    pub head: RepoHead,
    pub counts: RepoCounts,
    pub files: Vec<StatusFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoHead {
    pub branch_name: String,
    pub oid_short: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoCounts {
    pub staged: u32,
    pub unstaged: u32,
    pub untracked: u32,
    pub conflicted: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusFile {
    pub path: String,
    pub status: StatusKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub old_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum StatusKind {
    Staged,
    Unstaged,
    Both,
    Untracked,
    Conflicted,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedDiffText {
    pub text: String,
}
