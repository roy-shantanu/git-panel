import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  clAssignFiles,
  clCreate,
  clDelete,
  clList,
  clRename,
  clSetActive,
  commitExecute,
  commitPrepare,
  repoBranches,
  repoCheckout,
  repoCreateBranch,
  repoDiff,
  repoFetch,
  repoListRecent,
  repoOpen,
  repoStage,
  repoStatus,
  repoUnstage
} from "../api/tauri";
import { useAppStore } from "../state/store";
import type {
  BranchList,
  Changelist,
  ChangelistState,
  CommitPreview,
  RepoDiffKind,
  RepoError,
  StatusFile
} from "../types/ipc";

const POLL_INTERVAL_MS = 4000;
const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

export default function RepositoryPicker() {
  const { repo, status, recent, setRepo, setStatus, setRecent } = useAppStore();
  const [polling, setPolling] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<StatusFile | null>(null);
  const [diffKind, setDiffKind] = useState<RepoDiffKind>("unstaged");
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [branchBusy, setBranchBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [changelists, setChangelists] = useState<ChangelistState | null>(null);
  const [selectedChangelistId, setSelectedChangelistId] = useState<string>("default");
  const [commitMessage, setCommitMessage] = useState("");
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitAmend, setCommitAmend] = useState(false);
  const repoLabel = useMemo(() => {
    if (!repo) return "No repository selected";
    return `${repo.name} (${repo.path})`;
  }, [repo]);

  const files = status?.files ?? [];

  const changelistCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) {
      const key = file.changelist_id ?? "default";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [files]);

  useEffect(() => {
    repoListRecent().then(setRecent).catch(console.error);
  }, [setRecent]);

  useEffect(() => {
    if (!toast) return;
    const handle = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(handle);
  }, [toast]);

  useEffect(() => {
    setSelectedFile(null);
    setSelectedPath(null);
    setDiffText("");
    setDiffKind("unstaged");
    setSelectedChangelistId("default");
    setCommitMessage("");
    setCommitPreview(null);
    setCommitError(null);
    setCommitAmend(false);
    if (repo?.repo_id) {
      clList(repo.repo_id)
        .then(setChangelists)
        .catch((error) => console.error("cl_list failed", error));
    } else {
      setChangelists(null);
    }
  }, [repo?.repo_id]);

  useEffect(() => {
    if (!repo?.repo_id) return;

    let cancelled = false;
    setPolling(true);

    const fetchStatus = async () => {
      try {
        const next = await repoStatus(repo.repo_id);
        if (!cancelled) setStatus(next);
      } catch (error) {
        console.error("repo_status failed", error);
      }
    };

    fetchStatus();
    const handle = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
      setPolling(false);
    };
  }, [repo?.repo_id, setStatus]);

  useEffect(() => {
    if (!repo?.repo_id) {
      setBranches(null);
      return;
    }

    repoBranches(repo.repo_id)
      .then(setBranches)
      .catch((error) => console.error("repo_branches failed", error));
  }, [repo?.repo_id]);

  useEffect(() => {
    if (!repo?.repo_id || !selectedPath) return;

    let cancelled = false;
    setDiffLoading(true);
    repoDiff(repo.repo_id, selectedPath, diffKind)
      .then((result) => {
        if (!cancelled) setDiffText(result.text);
      })
      .catch((error) => {
        console.error("repo_diff failed", error);
        if (!cancelled) setDiffText("");
      })
      .finally(() => {
        if (!cancelled) setDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo?.repo_id, selectedPath, diffKind]);

  useEffect(() => {
    if (!repo?.repo_id) {
      setCommitPreview(null);
      setCommitError(null);
      return;
    }

    let cancelled = false;
    setCommitLoading(true);
    setCommitError(null);

    commitPrepare(repo.repo_id, selectedChangelistId)
      .then((preview) => {
        if (!cancelled) {
          setCommitPreview(preview);
          setCommitError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message =
            typeof error === "string"
              ? error
              : (error as Error)?.message ?? "Commit preview failed.";
          setCommitPreview(null);
          setCommitError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setCommitLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo?.repo_id, selectedChangelistId, status]);

  const handlePick = async () => {
    if (!isTauri) {
      console.warn("File picker requires the Tauri app runtime.");
      alert(
        "The native folder picker only works in the Tauri app. Run `npm run tauri dev`."
      );
      return;
    }

    let selection: string | string[] | null = null;
    try {
      selection = await open({ directory: true, multiple: false });
    } catch (error) {
      console.error("dialog.open failed", error);
      alert("Could not open the folder picker. Check the console for details.");
      return;
    }

    if (!selection || Array.isArray(selection)) return;

    try {
      const summary = await repoOpen(selection);
      setRepo(summary);
      const recents = await repoListRecent();
      setRecent(recents);
    } catch (error) {
      console.error("repo_open failed", error);
    }
  };

  const handleRefresh = async () => {
    if (!repo) return;
    try {
      const summary = await repoOpen(repo.path);
      setRepo(summary);
      const recents = await repoListRecent();
      setRecent(recents);
      const next = await repoStatus(summary.repo_id);
      setStatus(next);
      const branchList = await repoBranches(summary.repo_id);
      setBranches(branchList);
      const clState = await clList(summary.repo_id);
      setChangelists(clState);
    } catch (error) {
      console.error("repo_open failed", error);
    }
  };

  const handleCheckout = async (type: "local" | "remote", name: string) => {
    if (!repo) return;
    setBranchBusy(true);
    try {
      await repoCheckout(repo.repo_id, { type, name });
      const next = await repoStatus(repo.repo_id);
      setStatus(next);
      const branchList = await repoBranches(repo.repo_id);
      setBranches(branchList);
    } catch (error) {
      const typed = error as RepoError;
      if (typed?.type === "DirtyWorkingTree") {
        setToast("Checkout blocked: working tree has uncommitted changes.");
      } else {
        setToast("Checkout failed. See console for details.");
      }
      console.error("repo_checkout failed", error);
    } finally {
      setBranchBusy(false);
    }
  };

  const handleCreateBranch = async () => {
    if (!repo) return;
    const name = window.prompt("New branch name");
    if (!name) return;
    try {
      await repoCreateBranch(repo.repo_id, name);
      await handleCheckout("local", name);
    } catch (error) {
      setToast("Create branch failed. See console for details.");
      console.error("repo_create_branch failed", error);
    }
  };

  const handleFetch = async () => {
    if (!repo) return;
    setBranchBusy(true);
    try {
      await repoFetch(repo.repo_id);
      const branchList = await repoBranches(repo.repo_id);
      setBranches(branchList);
    } catch (error) {
      setToast("Fetch failed. See console for details.");
      console.error("repo_fetch failed", error);
    } finally {
      setBranchBusy(false);
    }
  };

  const refreshChangelists = async () => {
    if (!repo) return;
    const clState = await clList(repo.repo_id);
    setChangelists(clState);
  };

  const handleCreateChangelist = async () => {
    if (!repo) return;
    const name = window.prompt("New changelist name");
    if (!name) return;
    try {
      await clCreate(repo.repo_id, name);
      await refreshChangelists();
    } catch (error) {
      console.error("cl_create failed", error);
      setToast("Create changelist failed.");
    }
  };

  const handleRenameChangelist = async (list: Changelist) => {
    if (!repo) return;
    const name = window.prompt("Rename changelist", list.name);
    if (!name || name === list.name) return;
    try {
      await clRename(repo.repo_id, list.id, name);
      await refreshChangelists();
    } catch (error) {
      console.error("cl_rename failed", error);
      setToast("Rename changelist failed.");
    }
  };

  const handleDeleteChangelist = async (list: Changelist) => {
    if (!repo) return;
    if (!window.confirm(`Delete changelist "${list.name}"?`)) return;
    try {
      await clDelete(repo.repo_id, list.id);
      if (selectedChangelistId === list.id) {
        setSelectedChangelistId("default");
      }
      await refreshChangelists();
    } catch (error) {
      console.error("cl_delete failed", error);
      setToast("Delete changelist failed.");
    }
  };

  const handleSetActiveChangelist = async (id: string) => {
    if (!repo) return;
    try {
      await clSetActive(repo.repo_id, id);
      await refreshChangelists();
    } catch (error) {
      console.error("cl_set_active failed", error);
      setToast("Set active changelist failed.");
    }
  };

  const handleMoveFile = async (file: StatusFile, id: string) => {
    if (!repo) return;
    try {
      await clAssignFiles(repo.repo_id, id, [file.path]);
      await refreshChangelists();
      const next = await repoStatus(repo.repo_id);
      setStatus(next);
    } catch (error) {
      console.error("cl_assign failed", error);
      setToast("Move to changelist failed.");
    }
  };

  const handleCommit = async () => {
    if (!repo) return;
    if (!commitMessage.trim()) {
      setCommitError("Commit message is required.");
      return;
    }

    setCommitBusy(true);
    setCommitError(null);
    try {
      await commitExecute(repo.repo_id, selectedChangelistId, commitMessage.trim(), {
        amend: commitAmend
      });
      setCommitMessage("");
      setCommitAmend(false);
      const next = await repoStatus(repo.repo_id);
      setStatus(next);
      const clState = await clList(repo.repo_id);
      setChangelists(clState);
      setToast("Changelist committed.");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : (error as Error)?.message ?? "Commit failed.";
      setCommitError(message);
      setToast("Commit failed. See details in the commit panel.");
    } finally {
      setCommitBusy(false);
    }
  };

  const handleSelectFile = (file: StatusFile, kind: RepoDiffKind) => {
    setSelectedFile(file);
    setSelectedPath(file.path);
    setDiffKind(kind);
  };

  const handleStage = async (file: StatusFile) => {
    if (!repo) return;
    try {
      await repoStage(repo.repo_id, file.path);
      await handleRefresh();
    } catch (error) {
      console.error("repo_stage failed", error);
    }
  };

  const handleUnstage = async (file: StatusFile) => {
    if (!repo) return;
    try {
      await repoUnstage(repo.repo_id, file.path);
      await handleRefresh();
    } catch (error) {
      console.error("repo_unstage failed", error);
    }
  };

  const branchValue = branches?.current ? `local::${branches.current}` : "";
  const changelistItems = changelists?.lists ?? [];
  const activeChangelistId = changelists?.active_id ?? "default";

  useEffect(() => {
    if (!changelists) return;
    if (!changelistItems.some((item) => item.id === selectedChangelistId)) {
      setSelectedChangelistId("default");
    }
  }, [changelists, changelistItems, selectedChangelistId]);

  const filteredFiles = files.filter((file) => {
    if (selectedChangelistId === "default") {
      return !file.changelist_id || file.changelist_id === "default";
    }
    return file.changelist_id === selectedChangelistId;
  });

  return (
    <section className="panel">
      <h2>Repository Picker</h2>
      {toast && <div className="toast">{toast}</div>}
      <div className="row">
        <button className="button" onClick={handlePick}>
          Choose Folder
        </button>
        <span className="muted">{repoLabel}</span>
      </div>

      {repo && (
        <div className="repo-shell">
          <div className="row">
            <button className="button secondary" onClick={handleRefresh}>
              Refresh Summary
            </button>
            <span className="muted">Polling: {polling ? "on" : "off"}</span>
          </div>
          <div className="row">
            <label className="muted" htmlFor="branch-select">
              Branch
            </label>
            <select
              id="branch-select"
              className="branch-select"
              value={branchValue}
              disabled={!branches || branchBusy}
              onChange={(event) => {
                const value = event.target.value;
                if (!value) return;
                const [type, name] = value.split("::");
                if (type && name) {
                  handleCheckout(type as "local" | "remote", name);
                }
              }}
            >
              <option value="" disabled>
                {branches ? branches.current : "Loading branches..."}
              </option>
              {branches?.locals.map((name) => (
                <option key={`local-${name}`} value={`local::${name}`}>
                  {name}
                </option>
              ))}
              {branches?.remotes.map((name) => (
                <option key={`remote-${name}`} value={`remote::${name}`}>
                  {name}
                </option>
              ))}
            </select>
            <button className="button secondary" onClick={handleCreateBranch} disabled={branchBusy}>
              New Branch…
            </button>
            <button className="button secondary" onClick={handleFetch} disabled={branchBusy}>
              Fetch
            </button>
            {branchBusy && <span className="muted">Working…</span>}
          </div>

          <div className="status-grid">
            <div className="status-card">
              <strong>Branch</strong>
              <div>{status?.head.branch_name ?? "—"}</div>
            </div>
            <div className="status-card">
              <strong>Head</strong>
              <div>{status?.head.oid_short ?? "—"}</div>
            </div>
            <div className="status-card">
              <strong>Staged</strong>
              <div>{status?.counts.staged ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Unstaged</strong>
              <div>{status?.counts.unstaged ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Untracked</strong>
              <div>{status?.counts.untracked ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Conflicts</strong>
              <div>{status?.counts.conflicted ?? 0}</div>
            </div>
          </div>

          <div className="status-layout">
            <aside className="changelist-panel">
              <div className="changelist-header">
                <h3>Changelists</h3>
                <button className="chip" onClick={handleCreateChangelist}>
                  New
                </button>
              </div>
              <ul className="changelist-list">
                {changelistItems.map((list) => {
                  const count = changelistCounts.get(list.id) ?? 0;
                  const isActive = list.id === activeChangelistId;
                  return (
                    <li key={list.id} className="changelist-item">
                      <button
                        className={`changelist-link ${
                          selectedChangelistId === list.id ? "active" : ""
                        }`}
                        onClick={() => setSelectedChangelistId(list.id)}
                      >
                        {list.name}
                      </button>
                      <span className="count-pill">{count}</span>
                      {isActive ? (
                        <span className="active-pill">Active</span>
                      ) : (
                        <button
                          className="chip"
                          onClick={() => handleSetActiveChangelist(list.id)}
                        >
                          Set Active
                        </button>
                      )}
                      {list.id !== "default" && (
                        <div className="changelist-actions">
                          <button
                            className="chip"
                            onClick={() => handleRenameChangelist(list)}
                          >
                            Rename
                          </button>
                          <button
                            className="chip"
                            onClick={() => handleDeleteChangelist(list)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </aside>

            <div className="file-panel">
              <div className="file-header">
                <h3>
                  {changelistItems.find((item) => item.id === selectedChangelistId)?.name ??
                    "Files"}
                </h3>
                <span className="muted">
                  {filteredFiles.length} file{filteredFiles.length === 1 ? "" : "s"}
                </span>
              </div>

              <div className="commit-panel">
                <div className="commit-header">
                  <div>
                    <strong>Commit Changelist</strong>
                    <div className="muted">
                      {changelistItems.find((item) => item.id === selectedChangelistId)?.name ??
                        "Selected"}
                    </div>
                  </div>
                  <div className="commit-meta">
                    {commitLoading ? (
                      <span className="muted">Previewing…</span>
                    ) : commitPreview ? (
                      <span className="muted">
                        {commitPreview.files.length} file
                        {commitPreview.files.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="muted">No preview</span>
                    )}
                  </div>
                </div>

                <textarea
                  className="commit-input"
                  placeholder="Commit message"
                  value={commitMessage}
                  onChange={(event) => setCommitMessage(event.target.value)}
                  rows={3}
                />
                <label className="commit-checkbox">
                  <input
                    type="checkbox"
                    checked={commitAmend}
                    onChange={(event) => setCommitAmend(event.target.checked)}
                  />
                  Amend previous commit
                </label>

                {commitError && <div className="commit-error">{commitError}</div>}

                {commitPreview && (
                  <div className="commit-preview">
                    <div className="commit-stats">
                      <span className="count-pill">Staged {commitPreview.stats.staged}</span>
                      <span className="count-pill">Unstaged {commitPreview.stats.unstaged}</span>
                      <span className="count-pill">Untracked {commitPreview.stats.untracked}</span>
                    </div>
                    {commitPreview.warnings.length > 0 && (
                      <ul className="commit-warnings">
                        {commitPreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    )}
                    <ul className="commit-file-list">
                      {commitPreview.files.map((file) => (
                        <li key={`commit-${file.path}`}>
                          {file.path} <span className="muted">({file.status})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  className="button"
                  onClick={handleCommit}
                  disabled={
                    commitBusy || !!commitError || !commitPreview || !commitMessage.trim()
                  }
                >
                  {commitBusy ? "Committing…" : "Commit changelist"}
                </button>
              </div>

              {filteredFiles.length === 0 ? (
                <p className="muted">No files in this changelist.</p>
              ) : (
                <ul className="file-list">
                  {filteredFiles.map((file) => (
                    <li key={file.path} className="file-row">
                      <button
                        className="file-link"
                        onClick={() =>
                          handleSelectFile(
                            file,
                            file.status === "staged" ? "staged" : "unstaged"
                          )
                        }
                      >
                        {file.path}
                      </button>
                      <span className="status-pill">{file.status}</span>
                      <select
                        className="move-select"
                        value={file.changelist_id ?? "default"}
                        onChange={(event) => handleMoveFile(file, event.target.value)}
                      >
                        {changelistItems.map((list) => (
                          <option key={`move-${list.id}`} value={list.id}>
                            {list.name}
                          </option>
                        ))}
                      </select>
                      <div className="status-actions">
                        {file.status === "staged" || file.status === "both" ? (
                          <button className="chip" onClick={() => handleUnstage(file)}>
                            Unstage
                          </button>
                        ) : (
                          file.status !== "conflicted" && (
                            <button className="chip" onClick={() => handleStage(file)}>
                              Stage
                            </button>
                          )
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="diff-panel">
                <div className="diff-header">
                  <div>
                    <strong>Diff</strong>
                    <div className="muted">
                      {selectedFile ? selectedFile.path : "Select a file to view diff"}
                    </div>
                  </div>
                  {selectedFile && selectedFile.status !== "untracked" && (
                    <div className="diff-tabs">
                      <button
                        className={`chip ${diffKind === "unstaged" ? "active" : ""}`}
                        onClick={() => setDiffKind("unstaged")}
                        disabled={selectedFile.status === "staged"}
                      >
                        Unstaged
                      </button>
                      <button
                        className={`chip ${diffKind === "staged" ? "active" : ""}`}
                        onClick={() => setDiffKind("staged")}
                        disabled={selectedFile.status === "unstaged"}
                      >
                        Staged
                      </button>
                    </div>
                  )}
                </div>
                <pre className="diff-output">
                  {diffLoading
                    ? "Loading diff..."
                    : diffText || "No diff to display."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <strong>Recent Repositories</strong>
          <ul>
            {recent.map((item) => (
              <li key={item.repo_id} className="muted">
                {item.name} — {item.path}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
