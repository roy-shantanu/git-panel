import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { repoListRecent, repoOpen, repoStatus } from "../api/tauri";
import { useAppStore } from "../state/store";

const POLL_INTERVAL_MS = 4000;

export default function RepositoryPicker() {
  const { repo, status, recent, setRepo, setStatus, setRecent } = useAppStore();
  const [polling, setPolling] = useState(false);
  const repoLabel = useMemo(() => {
    if (!repo) return "No repository selected";
    return `${repo.name} (${repo.path})`;
  }, [repo]);

  useEffect(() => {
    repoListRecent().then(setRecent).catch(console.error);
  }, [setRecent]);

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

  const handlePick = async () => {
    const selection = await open({ directory: true, multiple: false });
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
    } catch (error) {
      console.error("repo_open failed", error);
    }
  };

  return (
    <section className="panel">
      <h2>Repository Picker</h2>
      <div className="row">
        <button className="button" onClick={handlePick}>
          Choose Folder
        </button>
        <span className="muted">{repoLabel}</span>
      </div>

      {repo && (
        <div>
          <div className="row">
            <button className="button secondary" onClick={handleRefresh}>
              Refresh Summary
            </button>
            <span className="muted">Polling: {polling ? "on" : "off"}</span>
          </div>
          <div className="status-grid">
            <div className="status-card">
              <strong>Branch</strong>
              <div>{status?.branch ?? "—"}</div>
            </div>
            <div className="status-card">
              <strong>Changed</strong>
              <div>{status?.changed ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Staged</strong>
              <div>{status?.staged ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Untracked</strong>
              <div>{status?.untracked ?? 0}</div>
            </div>
            <div className="status-card">
              <strong>Ahead / Behind</strong>
              <div>
                {status?.ahead ?? 0} / {status?.behind ?? 0}
              </div>
            </div>
            <div className="status-card">
              <strong>Last Updated</strong>
              <div>{status?.last_updated ?? 0}</div>
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
