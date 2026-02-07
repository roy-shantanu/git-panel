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
  repoBranches,
  repoCheckout,
  repoFetch,
  repoListRecent,
  repoOpen,
  repoOpenWorktree,
  repoStatus,
  wtList
} from "../api/tauri";
import type { BranchList, WorktreeInfo } from "../types/ipc";

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

export default function App() {
  const { repo, status, recent, setRepo, setRecent, setStatus } = useAppStore();
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [repoBusy, setRepoBusy] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
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
      return;
    }

    repoStatus(repo.repo_id).then(setStatus).catch(console.error);
    repoBranches(repo.repo_id).then(setBranches).catch(console.error);
  }, [repo?.repo_id, setStatus]);

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
                onFileSelect={setSelectedFile}
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
