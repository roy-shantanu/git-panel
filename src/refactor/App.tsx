import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { WorktreeSwitcher } from "./components/WorktreeSwitcher";
import { LeftNavPanel } from "./components/LeftNavPanel";
import { ChangesPanel } from "./components/ChangesPanel";
import { DiffView } from "./components/DiffView";
import { BranchPanel } from "./components/BranchPanel";
import { WelcomePage } from "./components/WelcomePage";
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
  repoStage,
  repoStatus,
  repoUnstage,
  wtList
} from "../api/tauri";
import type { BranchList, ChangelistState, StatusFile, WorktreeInfo } from "../types/ipc";

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

export default function App() {
  const { repo, status, recent, setRepo, setRecent, setStatus } = useAppStore();
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [changelists, setChangelists] = useState<ChangelistState | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [repoBusy, setRepoBusy] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [fileActionBusyPath, setFileActionBusyPath] = useState<string | null>(null);
  const [selectedChangelistId, setSelectedChangelistId] = useState("default");
  const [selectedFile, setSelectedFile] = useState<FileChange | null>({
    path: "src/app/App.tsx",
    status: "modified",
    additions: 45,
    deletions: 12,
  });
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
      setSelectedChangelistId("default");
      return;
    }

    repoStatus(repo.repo_id).then(setStatus).catch(console.error);
    repoBranches(repo.repo_id).then(setBranches).catch(console.error);
    clList(repo.repo_id).then(setChangelists).catch(console.error);
  }, [repo?.repo_id, setStatus]);

  useEffect(() => {
    if (!changelists) return;
    const ids = new Set(changelists.lists.map((item) => item.id));
    if (!ids.has(selectedChangelistId)) {
      setSelectedChangelistId("default");
    }
  }, [changelists, selectedChangelistId]);

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

  const handleSelectStatusFile = (file: StatusFile) => {
    setSelectedFile({
      path: file.path,
      status: file.status === "untracked" ? "added" : "modified",
      additions: 0,
      deletions: 0
    });
  };

  return (
    <div className="size-full flex flex-col bg-[#2b2b2b]">
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
          <div className="flex-1 flex overflow-hidden">
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
              <DiffView
                fileName={selectedFile.path}
                additions={selectedFile.additions}
                deletions={selectedFile.deletions}
                viewMode={viewMode}
                showHunks={showHunks}
              />
            ) : (
              <div className="flex-1 bg-[#2b2b2b] flex items-center justify-center">
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
            onCheckout={handleCheckout}
          />
        </>
      )}
    </div>
  );
}
