#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod changelist;
mod git;
mod jobs;
mod model;
mod store;
mod watch;

use std::sync::Mutex;

fn main() {
    tracing_subscriber::fmt().with_target(false).init();
    tracing::info!("Git Panel backend starting");

    tauri::Builder::default()
        .manage(Mutex::new(store::AppState::default()))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            api::repo_open,
            api::repo_status,
            api::repo_diff,
            api::repo_stage,
            api::repo_unstage,
            api::repo_branches,
            api::repo_checkout,
            api::repo_create_branch,
            api::repo_fetch,
            api::cl_list,
            api::cl_create,
            api::cl_rename,
            api::cl_delete,
            api::cl_set_active,
            api::cl_assign_files,
            api::cl_unassign_files,
            api::commit_prepare,
            api::commit_execute,
            api::repo_list_recent,
            api::app_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
