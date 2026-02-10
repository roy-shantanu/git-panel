use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc::{self, RecvTimeoutError},
    Arc,
};
use std::thread;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::git::resolve_git_dir;
use crate::model::RepoId;

pub struct RepoWatcher {
    _watcher: RecommendedWatcher,
    stop: Arc<AtomicBool>,
}

impl RepoWatcher {
    pub fn new(app: AppHandle, repo_id: RepoId, worktree_path: String) -> Result<Self, String> {
        let git_dir = resolve_git_dir(&worktree_path);
        let (tx, rx) = mpsc::channel();
        let mut watcher = notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        })
        .map_err(|e| e.to_string())?;

        let index_path = git_dir.join("index");
        if index_path.exists() {
            watcher
                .watch(index_path.as_path(), RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
        }
        let head_path = git_dir.join("HEAD");
        if head_path.exists() {
            watcher
                .watch(head_path.as_path(), RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
        }
        let refs_path = git_dir.join("refs");
        if refs_path.exists() {
            watcher
                .watch(refs_path.as_path(), RecursiveMode::Recursive)
                .map_err(|e| e.to_string())?;
        }
        watcher
            .watch(std::path::Path::new(&worktree_path), RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;

        let stop = Arc::new(AtomicBool::new(false));
        let stop_thread = stop.clone();
        thread::spawn(move || {
            let debounce = Duration::from_millis(400);
            loop {
                if stop_thread.load(Ordering::Relaxed) {
                    break;
                }
                match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(_) => {
                        while matches!(rx.recv_timeout(debounce), Ok(_)) {}
                        let _ = app.emit("repo_changed", repo_id.clone());
                    }
                    Err(RecvTimeoutError::Timeout) => continue,
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        });

        Ok(Self {
            _watcher: watcher,
            stop,
        })
    }
}

impl Drop for RepoWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
