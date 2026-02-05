import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
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
import type { BranchList, RepoDiffKind, RepoError, StatusFile } from "../types/ipc";

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
  const repoLabel = useMemo(() => {
    if (!repo) return "No repository selected";
    return `${repo.name} (${repo.path})`;
  }, [repo]);

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

  const files = status?.files ?? [];
  const stagedFiles = files.filter(
    (file) => file.status === "staged" || file.status === "both"
  );
  const unstagedFiles = files.filter(
    (file) => file.status === "unstaged" || file.status === "both"
  );
  const untrackedFiles = files.filter((file) => file.status === "untracked");
  const conflictedFiles = files.filter((file) => file.status === "conflicted");
  const branchValue = branches?.current ? `local::${branches.current}` : "";

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
            <div className="status-lists">
              <div className="status-section">
                <h3>Staged</h3>
                {stagedFiles.length === 0 && <p className="muted">No staged files.</p>}
                <ul>
                  {stagedFiles.map((file) => (
                    <li key={`staged-${file.path}`} className="status-item">
                      <button
                        className="file-link"
                        onClick={() => handleSelectFile(file, "staged")}
                      >
                        {file.path}
                      </button>
                      <div className="status-actions">
                        <button className="chip" onClick={() => handleUnstage(file)}>
                          Unstage
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="status-section">
                <h3>Unstaged</h3>
                {unstagedFiles.length === 0 && <p className="muted">No unstaged files.</p>}
                <ul>
                  {unstagedFiles.map((file) => (
                    <li key={`unstaged-${file.path}`} className="status-item">
                      <button
                        className="file-link"
                        onClick={() => handleSelectFile(file, "unstaged")}
                      >
                        {file.path}
                      </button>
                      <div className="status-actions">
                        {file.status !== "conflicted" && (
                          <button className="chip" onClick={() => handleStage(file)}>
                            Stage
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="status-section">
                <h3>Untracked</h3>
                {untrackedFiles.length === 0 && <p className="muted">No untracked files.</p>}
                <ul>
                  {untrackedFiles.map((file) => (
                    <li key={`untracked-${file.path}`} className="status-item">
                      <button
                        className="file-link"
                        onClick={() => handleSelectFile(file, "unstaged")}
                      >
                        {file.path}
                      </button>
                      <div className="status-actions">
                        <button className="chip" onClick={() => handleStage(file)}>
                          Stage
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="status-section">
                <h3>Conflicts</h3>
                {conflictedFiles.length === 0 && <p className="muted">No conflicts.</p>}
                <ul>
                  {conflictedFiles.map((file) => (
                    <li key={`conflict-${file.path}`} className="status-item">
                      <button
                        className="file-link"
                        onClick={() => handleSelectFile(file, "unstaged")}
                      >
                        {file.path}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

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
