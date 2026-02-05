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
pub struct RepoBranchListRequest {
    pub repo_id: RepoId,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoCheckoutRequest {
    pub repo_id: RepoId,
    pub target: CheckoutTarget,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoCreateBranchRequest {
    pub repo_id: RepoId,
    pub name: String,
    #[serde(default)]
    pub from: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoFetchRequest {
    pub repo_id: RepoId,
    #[serde(default)]
    pub remote: Option<String>,
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
pub struct BranchList {
    pub current: String,
    pub locals: Vec<String>,
    pub remotes: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ahead_behind: Option<std::collections::HashMap<String, AheadBehind>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AheadBehind {
    pub ahead: u32,
    pub behind: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckoutTarget {
    #[serde(rename = "type")]
    pub kind: CheckoutTargetKind,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CheckoutTargetKind {
    Local,
    Remote,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CheckoutResult {
    pub head: RepoHead,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchCreateResult {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResult {
    pub remote: String,
    pub updated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RepoError {
    DirtyWorkingTree { message: String },
    GitError { message: String },
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
