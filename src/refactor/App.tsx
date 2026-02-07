import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { WorktreeSwitcher } from "./components/WorktreeSwitcher";
import { LeftNavPanel } from "./components/LeftNavPanel";
import { ChangesPanel } from "./components/ChangesPanel";
import { DiffView } from "./components/DiffView";
import { BranchPanel } from "./components/BranchPanel";
import { WelcomePage } from "./components/WelcomePage";
import type { WatcherStatus } from "./components/WatcherPill";
import { useAppStore } from "../state/store";
import {
  clAssignFiles,
  clCreate,
  clDelete,
  clList,
  clRename,
  clSetActive,
  repoBranches,
  repoCheckout,
  repoFetch,
  repoListRecent,
  repoOpen,
  repoOpenWorktree,
  repoDiffPayload,
  repoStage,
  repoStatus,
  repoUnstage,
  wtList
} from "../api/tauri";
import type {
  BranchList,
  ChangelistState,
  RepoDiffKind,
  RepoDiffPayload,
  StatusFile,
  WorktreeInfo
} from "../types/ipc";

export default function App() {
  const { repo, status, recent, setRepo, setRecent, setStatus } = useAppStore();
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [changelists, setChangelists] = useState<ChangelistState | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [repoBusy, setRepoBusy] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [watcherBusy, setWatcherBusy] = useState(false);
  const [watcherStatus, setWatcherStatus] = useState<WatcherStatus>("offline");
  const [watcherChannelReady, setWatcherChannelReady] = useState(false);
  const [fileActionBusyPath, setFileActionBusyPath] = useState<string | null>(null);
  const [selectedChangelistId, setSelectedChangelistId] = useState("default");
  const [selectedFile, setSelectedFile] = useState<StatusFile | null>(null);
  const [selectedDiffKind, setSelectedDiffKind] = useState<RepoDiffKind>("unstaged");
  const [selectedDiffPayload, setSelectedDiffPayload] = useState<RepoDiffPayload | null>(null);
  const [selectedDiffLoading, setSelectedDiffLoading] = useState(false);
  const [selectedDiffError, setSelectedDiffError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"unified" | "sideBySide">("unified");
  const [showHunks, setShowHunks] = useState(false);
  const [isSourceControlOpen, setIsSourceControlOpen] = useState(true);

  const handleCommit = () => {
    console.log("Commit clicked");
    // Handle commit action
  };

  const toggleSourceControl = () => {
    setIsSourceControlOpen((prev) => !prev);
  };

  useEffect(() => {
    repoListRecent().then(setRecent).catch(console.error);
  }, [setRecent]);

  useEffect(() => {
    if (!repo?.repo_id) {
      setStatus(undefined);
      setBranches(null);
      setChangelists(null);
      setWatcherBusy(false);
      setWatcherStatus("offline");
      setWatcherChannelReady(false);
      setSelectedChangelistId("default");
      setSelectedFile(null);
      setSelectedDiffPayload(null);
      setSelectedDiffLoading(false);
      setSelectedDiffError(null);
      return;
    }

    repoStatus(repo.repo_id).then(setStatus).catch(console.error);
    repoBranches(repo.repo_id).then(setBranches).catch(console.error);
    clList(repo.repo_id).then(setChangelists).catch(console.error);
  }, [repo?.repo_id, setStatus]);

  useEffect(() => {
    if (!repo?.repo_id) return;

    let cancelled = false;
    let dispose: (() => void) | null = null;

    const refresh = async () => {
      try {
        const [nextStatus, nextChangelists] = await Promise.all([
          repoStatus(repo.repo_id),
          clList(repo.repo_id)
        ]);
        if (cancelled) return;
        setStatus(nextStatus);
        setChangelists(nextChangelists);
        setWatcherStatus("active");
      } catch (error) {
        console.error("repo_changed refresh failed", error);
        if (!cancelled) setWatcherStatus("degraded");
      }
    };

    setWatcherStatus("connecting");
    setWatcherChannelReady(false);

    listen<string>("repo_changed", (event) => {
      if (event.payload === repo.repo_id) {
        refresh();
      }
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        dispose = unlisten;
        setWatcherChannelReady(true);
        setWatcherStatus("active");
      })
      .catch((error) => {
        console.error("repo_changed listener failed", error);
        if (!cancelled) {
          setWatcherChannelReady(false);
          setWatcherStatus("offline");
        }
      });

    return () => {
      cancelled = true;
      if (dispose) dispose();
    };
  }, [repo?.repo_id, setStatus]);

  useEffect(() => {
    if (!repo?.repo_id) return;

    let cancelled = false;
    let inFlight = false;
    const intervalMs = 2500;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [nextStatus, nextChangelists] = await Promise.all([
          repoStatus(repo.repo_id),
          clList(repo.repo_id)
        ]);
        if (!cancelled) {
          setStatus(nextStatus);
          setChangelists(nextChangelists);
          setWatcherStatus(watcherChannelReady ? "active" : "degraded");
        }
      } catch (error) {
        console.error("repo polling refresh failed", error);
        if (!cancelled) {
          setWatcherStatus((prev) => (prev === "offline" ? "offline" : "degraded"));
        }
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(refresh, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [repo?.repo_id, setStatus, watcherChannelReady]);

  useEffect(() => {
    if (!changelists) return;
    const ids = new Set(changelists.lists.map((item) => item.id));
    if (!ids.has(selectedChangelistId)) {
      setSelectedChangelistId("default");
    }
  }, [changelists, selectedChangelistId]);

  useEffect(() => {
    if (!selectedFile || !status) return;
    const matched = status.files.find((file) => file.path === selectedFile.path);
    if (!matched) {
      setSelectedFile(null);
      setSelectedDiffPayload(null);
      setSelectedDiffError(null);
      return;
    }
    setSelectedFile(matched);
  }, [selectedFile, status]);

  useEffect(() => {
    if (!repo?.repo_root) {
      setWorktrees([]);
      return;
    }

    wtList(repo.repo_root)
      .then((result) => setWorktrees(result.worktrees))
      .catch(console.error);
  }, [repo?.repo_root]);

  const aheadBehind = useMemo(() => {
    if (!branches?.ahead_behind) return null;
    return branches.ahead_behind[branches.current] ?? null;
  }, [branches]);

  const recentRepoOptions = useMemo(() => {
    const seen = new Set<string>();
    return recent.filter((item) => {
      const key = (item.repo_root || item.path).replace(/\//g, "\\").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [recent]);

  const handleOpenRepoPicker = async () => {
    try {
      setRepoBusy(true);
      const path = await open({
        directory: true,
        multiple: false
      });
      if (!path || Array.isArray(path)) return;
      const nextRepo = await repoOpen(path);
      setRepo(nextRepo);
      const nextRecent = await repoListRecent();
      setRecent(nextRecent);
    } catch (error) {
      console.error("repo_open failed", error);
    } finally {
      setRepoBusy(false);
    }
  };

  const handleSelectRecentRepo = async (path: string) => {
    try {
      setRepoBusy(true);
      const nextRepo = await repoOpen(path);
      setRepo(nextRepo);
      const nextRecent = await repoListRecent();
      setRecent(nextRecent);
    } catch (error) {
      console.error("repo_open failed", error);
    } finally {
      setRepoBusy(false);
    }
  };

  const handleSelectWorktree = async (path: string) => {
    if (!repo?.repo_root) return;
    try {
      setWorktreeBusy(true);
      const nextRepo = await repoOpenWorktree(repo.repo_root, path);
      setRepo(nextRepo);
    } catch (error) {
      console.error("repo_open_worktree failed", error);
    } finally {
      setWorktreeBusy(false);
    }
  };

  const handleCheckout = async (type: "local" | "remote", name: string) => {
    if (!repo?.repo_id) return;
    try {
      setBranchBusy(true);
      await repoCheckout(repo.repo_id, { type, name });
      const [nextStatus, nextBranches] = await Promise.all([
        repoStatus(repo.repo_id),
        repoBranches(repo.repo_id)
      ]);
      setStatus(nextStatus);
      setBranches(nextBranches);
    } catch (error) {
      console.error("repo_checkout failed", error);
    } finally {
      setBranchBusy(false);
    }
  };

  const handleFetch = async () => {
    if (!repo?.repo_id) return;
    try {
      setFetchBusy(true);
      await repoFetch(repo.repo_id);
      const nextBranches = await repoBranches(repo.repo_id);
      setBranches(nextBranches);
    } catch (error) {
      console.error("repo_fetch failed", error);
    } finally {
      setFetchBusy(false);
    }
  };

  const refreshRepoData = async (repoId: string) => {
    const [nextStatus, nextChangelists] = await Promise.all([
      repoStatus(repoId),
      clList(repoId)
    ]);
    setStatus(nextStatus);
    setChangelists(nextChangelists);
  };

  const handleManualRefresh = async () => {
    if (!repo?.repo_id) return;
    try {
      setWatcherBusy(true);
      await refreshRepoData(repo.repo_id);
      setWatcherStatus(watcherChannelReady ? "active" : "degraded");
    } catch (error) {
      console.error("manual refresh failed", error);
      setWatcherStatus((prev) => (prev === "offline" ? "offline" : "degraded"));
    } finally {
      setWatcherBusy(false);
    }
  };

  const handleCreateChangelist = async (name: string) => {
    if (!repo?.repo_id) return;
    await clCreate(repo.repo_id, name);
    const next = await clList(repo.repo_id);
    setChangelists(next);
  };

  const handleRenameChangelist = async (id: string, name: string) => {
    if (!repo?.repo_id) return;
    await clRename(repo.repo_id, id, name);
    const next = await clList(repo.repo_id);
    setChangelists(next);
  };

  const handleDeleteChangelist = async (id: string) => {
    if (!repo?.repo_id) return;
    await clDelete(repo.repo_id, id);
    if (selectedChangelistId === id) {
      setSelectedChangelistId("default");
    }
    const next = await clList(repo.repo_id);
    setChangelists(next);
  };

  const handleSetActiveChangelist = async (id: string) => {
    if (!repo?.repo_id) return;
    await clSetActive(repo.repo_id, id);
    const next = await clList(repo.repo_id);
    setChangelists(next);
  };

  const handleStageFile = async (file: StatusFile) => {
    if (!repo?.repo_id) return;
    try {
      setFileActionBusyPath(file.path);
      await repoStage(repo.repo_id, file.path);
      await refreshRepoData(repo.repo_id);
    } catch (error) {
      console.error("repo_stage failed", error);
    } finally {
      setFileActionBusyPath(null);
    }
  };

  const handleUnstageFile = async (file: StatusFile) => {
    if (!repo?.repo_id) return;
    try {
      setFileActionBusyPath(file.path);
      await repoUnstage(repo.repo_id, file.path);
      if (changelists) {
        const targetId = changelists.active_id ?? "default";
        try {
          await clAssignFiles(repo.repo_id, targetId, [file.path]);
        } catch (assignError) {
          // Keep unstage successful even if assignment fails due transient backend state.
          console.error("cl_assign_files failed after unstage", assignError);
        }
      }
      const nextStatus = await repoStatus(repo.repo_id);
      setStatus(nextStatus);
      const nextChangelists = await clList(repo.repo_id);
      setChangelists(nextChangelists);
    } catch (error) {
      console.error("repo_unstage failed", error);
    } finally {
      setFileActionBusyPath(null);
    }
  };

  useEffect(() => {
    if (!repo?.repo_id || !selectedFile?.path) {
      setSelectedDiffPayload(null);
      setSelectedDiffLoading(false);
      setSelectedDiffError(null);
      return;
    }

    let cancelled = false;
    setSelectedDiffLoading(true);
    setSelectedDiffError(null);
    setSelectedDiffPayload(null);
    repoDiffPayload(repo.repo_id, selectedFile.path, selectedDiffKind)
      .then((payload) => {
        if (cancelled) return;
        setSelectedDiffPayload(payload);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("repo_diff_payload failed", error);
        setSelectedDiffPayload(null);
        setSelectedDiffError((error as Error)?.message ?? "Diff load failed.");
      })
      .finally(() => {
        if (!cancelled) setSelectedDiffLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [repo?.repo_id, selectedFile?.path, selectedDiffKind]);

  const handleSelectStatusFile = (file: StatusFile, kind: RepoDiffKind) => {
    setSelectedFile(file);
    setSelectedDiffKind(kind);
  };

  return (
    <div className="size-full h-full overflow-hidden flex flex-col bg-[#2b2b2b]">
      {!repo ? (
        <WelcomePage
          recent={recentRepoOptions}
          repoBusy={repoBusy}
          onOpenRepo={handleOpenRepoPicker}
          onSelectRecentRepo={handleSelectRecentRepo}
        />
      ) : (
        <>
          {/* Top Bar - Worktree Switcher */}
            <WorktreeSwitcher
              repo={repo}
              recent={recentRepoOptions}
              worktrees={worktrees}
              repoBusy={repoBusy}
              worktreeBusy={worktreeBusy}
              fetchBusy={fetchBusy}
            onOpenRepo={handleOpenRepoPicker}
            onSelectRecentRepo={handleSelectRecentRepo}
            onSelectWorktree={handleSelectWorktree}
            onFetch={handleFetch}
          />

          {/* Main Content Area */}
          <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
            {/* Left Nav Panel */}
            <LeftNavPanel
              onCommitClick={handleCommit}
              onSourceControlToggle={toggleSourceControl}
              isSourceControlOpen={isSourceControlOpen}
            />

            {/* Left Sidebar - Changes Panel */}
            {isSourceControlOpen && (
              <ChangesPanel
                status={status}
                changelists={changelists}
                selectedChangelistId={selectedChangelistId}
                onSelectedChangelistChange={setSelectedChangelistId}
                onCreateChangelist={handleCreateChangelist}
                onRenameChangelist={handleRenameChangelist}
                onDeleteChangelist={handleDeleteChangelist}
                onSetActiveChangelist={handleSetActiveChangelist}
                onStageFile={handleStageFile}
                onUnstageFile={handleUnstageFile}
                fileActionBusyPath={fileActionBusyPath}
                onFileSelect={handleSelectStatusFile}
                selectedFile={selectedFile}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                showHunks={showHunks}
                onShowHunksChange={setShowHunks}
              />
            )}

            {/* Center - Diff View */}
            {selectedFile ? (
              <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
                <DiffView
                  fileName={selectedFile.path}
                  payload={selectedDiffPayload}
                  loading={selectedDiffLoading}
                  error={selectedDiffError}
                  viewMode={viewMode}
                  showHunks={showHunks}
                />
              </div>
            ) : (
              <div className="flex-1 min-w-0 min-h-0 bg-[#2b2b2b] flex items-center justify-center">
                <p className="text-[#787878]">Select a file to view changes</p>
              </div>
            )}
          </div>

          {/* Bottom Bar - Branch Panel */}
          <BranchPanel
            branchCurrent={branches?.current ?? "No branch"}
            localBranches={branches?.locals ?? []}
            remoteBranches={branches?.remotes ?? []}
            aheadBehind={aheadBehind}
            counts={status?.counts}
            checkoutBusy={branchBusy}
            watcherStatus={watcherStatus}
            watcherBusy={watcherBusy}
            onCheckout={handleCheckout}
            onManualRefresh={handleManualRefresh}
          />
        </>
      )}
    </div>
  );
}
