use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use crate::git::resolve_git_dir;
use crate::model::{
    Changelist, ChangelistState, HunkAssignment, HunkAssignmentSet, RepoStatus, RepoSummary,
};
use crate::store::now_ms;

const DEFAULT_ID: &str = "default";
const DEFAULT_NAME: &str = "Default";

pub fn load_state(summary: &RepoSummary) -> Result<ChangelistState, String> {
    let path = changelist_path(summary);
    if !path.exists() {
        let state = default_state();
        save_state(summary, &state)?;
        return Ok(state);
    }

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut state: ChangelistState = match serde_json::from_str(&content) {
        Ok(state) => state,
        Err(_) => {
            let state = default_state();
            save_state(summary, &state)?;
            return Ok(state);
        }
    };
    let changed = normalize_state(&mut state);
    if changed {
        save_state(summary, &state)?;
    }
    Ok(state)
}

pub fn save_state(summary: &RepoSummary, state: &ChangelistState) -> Result<(), String> {
    let path = changelist_path(summary);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}

pub fn create(summary: &RepoSummary, name: &str) -> Result<Changelist, String> {
    let mut state = load_state(summary)?;
    let mut id = format!("cl-{}", now_ms());
    if state.lists.iter().any(|item| item.id == id) {
        id = format!("cl-{}-{}", now_ms(), state.lists.len());
    }
    let list = Changelist {
        id: id.clone(),
        name: name.to_string(),
        created_at: now_ms(),
    };
    state.lists.push(list.clone());
    save_state(summary, &state)?;
    Ok(list)
}

pub fn rename(summary: &RepoSummary, id: &str, name: &str) -> Result<(), String> {
    let mut state = load_state(summary)?;
    let mut found = false;
    for item in &mut state.lists {
        if item.id == id {
            item.name = name.to_string();
            found = true;
            break;
        }
    }
    if !found {
        return Err("unknown changelist id".to_string());
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn delete(summary: &RepoSummary, id: &str) -> Result<(), String> {
    if id == DEFAULT_ID {
        return Err("cannot delete default changelist".to_string());
    }
    let mut state = load_state(summary)?;
    state.lists.retain(|item| item.id != id);
    state.assignments.retain(|_, value| value != id);
    state
        .hunk_assignments
        .retain(|_, assignment| assignment.changelist_id != id);
    if state.active_id == id {
        state.active_id = DEFAULT_ID.to_string();
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn set_active(summary: &RepoSummary, id: &str) -> Result<(), String> {
    let mut state = load_state(summary)?;
    if !state.lists.iter().any(|item| item.id == id) {
        return Err("unknown changelist id".to_string());
    }
    state.active_id = id.to_string();
    save_state(summary, &state)?;
    Ok(())
}

pub fn assign_files(
    summary: &RepoSummary,
    changelist_id: &str,
    paths: &[String],
) -> Result<(), String> {
    let mut state = load_state(summary)?;
    if !state.lists.iter().any(|item| item.id == changelist_id) {
        return Err("unknown changelist id".to_string());
    }
    for path in paths {
        state
            .assignments
            .insert(path.to_string(), changelist_id.to_string());
        state.hunk_assignments.remove(path);
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn unassign_files(summary: &RepoSummary, paths: &[String]) -> Result<(), String> {
    let mut state = load_state(summary)?;
    for path in paths {
        state.assignments.remove(path);
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn clear_assignments(summary: &RepoSummary, paths: &[String]) -> Result<(), String> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut state = load_state(summary)?;
    for path in paths {
        state.assignments.remove(path);
        state.hunk_assignments.remove(path);
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn assign_hunks(
    summary: &RepoSummary,
    changelist_id: &str,
    path: &str,
    hunks: &[HunkAssignment],
) -> Result<(), String> {
    if hunks.is_empty() {
        return Err("no hunks provided".to_string());
    }
    let mut state = load_state(summary)?;
    if !state.lists.iter().any(|item| item.id == changelist_id) {
        return Err("unknown changelist id".to_string());
    }
    state.assignments.remove(path);
    state.hunk_assignments.insert(
        path.to_string(),
        HunkAssignmentSet {
            changelist_id: changelist_id.to_string(),
            hunks: hunks.to_vec(),
        },
    );
    save_state(summary, &state)?;
    Ok(())
}

pub fn unassign_hunks(
    summary: &RepoSummary,
    path: &str,
    hunk_ids: &[String],
) -> Result<(), String> {
    let mut state = load_state(summary)?;
    if let Some(entry) = state.hunk_assignments.get_mut(path) {
        entry.hunks.retain(|hunk| !hunk_ids.contains(&hunk.id));
        if entry.hunks.is_empty() {
            state.hunk_assignments.remove(path);
        }
    }
    save_state(summary, &state)?;
    Ok(())
}

pub fn apply_to_status(
    summary: &RepoSummary,
    state: &mut ChangelistState,
    status: &mut RepoStatus,
) -> Result<(), String> {
    let mut rename_applied = false;
    let list_map = list_map(state);
    for file in &mut status.files {
        let mut assigned = state.assignments.get(&file.path).cloned();
        if assigned.is_none() {
            if let Some(old) = file.old_path.as_ref() {
                if let Some(old_id) = state.assignments.get(old).cloned() {
                    state.assignments.remove(old);
                    state.assignments.insert(file.path.clone(), old_id.clone());
                    assigned = Some(old_id);
                    rename_applied = true;
                }
            }
        }

        if assigned.is_none() {
            if let Some(old) = file.old_path.as_ref() {
                if let Some(old_hunks) = state.hunk_assignments.remove(old) {
                    state
                        .hunk_assignments
                        .insert(file.path.clone(), old_hunks);
                    rename_applied = true;
                }
            }
        }

        if let Some(id) = assigned {
            if let Some(name) = list_map.get(&id) {
                file.changelist_id = Some(id);
                file.changelist_name = Some(name.clone());
                file.changelist_partial = Some(false);
                continue;
            }
        }

        if let Some(hunks) = state.hunk_assignments.get(&file.path) {
            if let Some(name) = list_map.get(&hunks.changelist_id) {
                file.changelist_id = Some(hunks.changelist_id.clone());
                file.changelist_name = Some(name.clone());
                file.changelist_partial = Some(true);
                continue;
            }
        }

        file.changelist_id = Some(DEFAULT_ID.to_string());
        file.changelist_name = Some(DEFAULT_NAME.to_string());
        file.changelist_partial = Some(false);
    }

    if rename_applied {
        save_state(summary, state)?;
    }
    Ok(())
}

pub fn default_state() -> ChangelistState {
    ChangelistState {
        lists: vec![Changelist {
            id: DEFAULT_ID.to_string(),
            name: DEFAULT_NAME.to_string(),
            created_at: now_ms(),
        }],
        active_id: DEFAULT_ID.to_string(),
        assignments: HashMap::new(),
        hunk_assignments: HashMap::new(),
    }
}

fn normalize_state(state: &mut ChangelistState) -> bool {
    let mut changed = false;
    if !state.lists.iter().any(|item| item.id == DEFAULT_ID) {
        state.lists.insert(
            0,
            Changelist {
                id: DEFAULT_ID.to_string(),
                name: DEFAULT_NAME.to_string(),
                created_at: now_ms(),
            },
        );
        changed = true;
    }
    if !state.lists.iter().any(|item| item.id == state.active_id) {
        state.active_id = DEFAULT_ID.to_string();
        changed = true;
    }
    if state.assignments.is_empty() {
        state.assignments = HashMap::new();
    }
    changed
}

fn list_map(state: &ChangelistState) -> HashMap<String, String> {
    state
        .lists
        .iter()
        .map(|item| (item.id.clone(), item.name.clone()))
        .collect()
}

fn changelist_path(summary: &RepoSummary) -> PathBuf {
    let git_dir = resolve_git_dir(&summary.worktree_path);
    git_dir.join("gitpanel").join("changelists.json")
}

#[cfg(test)]
mod tests {
    use super::{assign_files, assign_hunks, create, load_state};
    use crate::model::{HunkAssignment, RepoDiffKind, RepoSummary};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_repo() -> (RepoSummary, PathBuf) {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_millis();
        let path = std::env::temp_dir().join(format!("gitpanel-test-{millis}"));
        fs::create_dir_all(path.join(".git")).expect("create repo dir");
        let summary = RepoSummary {
            repo_id: "test-repo".to_string(),
            path: path.to_string_lossy().to_string(),
            name: "test".to_string(),
            repo_root: path.to_string_lossy().to_string(),
            worktree_path: path.to_string_lossy().to_string(),
            is_valid: true,
        };
        (summary, path)
    }

    #[test]
    fn persists_changelist_assignments() {
        let (summary, path) = temp_repo();

        let created = create(&summary, "Feature").expect("create changelist");
        assign_files(&summary, &created.id, &["src/main.rs".to_string()])
            .expect("assign file");

        let state = load_state(&summary).expect("load state");
        assert!(state.lists.iter().any(|item| item.id == created.id));
        assert_eq!(
            state.assignments.get("src/main.rs"),
            Some(&created.id)
        );

        let _ = fs::remove_dir_all(path);
    }

    #[test]
    fn persists_hunk_assignments() {
        let (summary, path) = temp_repo();

        let created = create(&summary, "Feature").expect("create changelist");
        let hunks = vec![HunkAssignment {
            id: "1:1:1:1:deadbeef".to_string(),
            header: "@@ -1 +1 @@".to_string(),
            old_start: 1,
            old_lines: 1,
            new_start: 1,
            new_lines: 1,
            content_hash: "deadbeef".to_string(),
            kind: RepoDiffKind::Unstaged,
        }];

        assign_hunks(&summary, &created.id, "src/main.rs", &hunks).expect("assign hunks");

        let state = load_state(&summary).expect("load state");
        let entry = state.hunk_assignments.get("src/main.rs").expect("hunks");
        assert_eq!(entry.changelist_id, created.id);
        assert_eq!(entry.hunks.len(), 1);

        let _ = fs::remove_dir_all(path);
    }
}
