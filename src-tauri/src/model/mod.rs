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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changelist_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changelist_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changelist_partial: Option<bool>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffHunk {
    pub path: String,
    pub kind: RepoDiffKind,
    pub id: String,
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub content: String,
    pub content_hash: String,
    pub file_header: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Changelist {
    pub id: String,
    pub name: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistState {
    pub lists: Vec<Changelist>,
    pub active_id: String,
    pub assignments: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub hunk_assignments: std::collections::HashMap<String, HunkAssignmentSet>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistIdRequest {
    pub repo_id: RepoId,
    pub id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistCreateRequest {
    pub repo_id: RepoId,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistRenameRequest {
    pub repo_id: RepoId,
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistAssignRequest {
    pub repo_id: RepoId,
    pub changelist_id: String,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistUnassignRequest {
    pub repo_id: RepoId,
    pub paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkAssignment {
    pub id: String,
    pub header: String,
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub content_hash: String,
    pub kind: RepoDiffKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HunkAssignmentSet {
    pub changelist_id: String,
    pub hunks: Vec<HunkAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistAssignHunksRequest {
    pub repo_id: RepoId,
    pub changelist_id: String,
    pub path: String,
    pub hunks: Vec<HunkAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChangelistUnassignHunksRequest {
    pub repo_id: RepoId,
    pub path: String,
    pub hunk_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitPrepareRequest {
    pub repo_id: RepoId,
    pub changelist_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CommitOptions {
    #[serde(default)]
    pub amend: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitExecuteRequest {
    pub repo_id: RepoId,
    pub changelist_id: String,
    pub message: String,
    #[serde(default)]
    pub options: CommitOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitPreview {
    pub changelist_id: String,
    pub files: Vec<StatusFile>,
    pub stats: RepoCounts,
    pub warnings: Vec<String>,
    pub hunk_files: Vec<String>,
    pub invalid_hunks: Vec<HunkAssignment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitResult {
    pub head: RepoHead,
    pub commit_id: String,
    pub committed_paths: Vec<String>,
}
