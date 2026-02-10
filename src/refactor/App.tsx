import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { WorktreeSwitcher } from "./components/WorktreeSwitcher";
import { LeftNavPanel } from "./components/LeftNavPanel";
import { ChangesPanel } from "./components/ChangesPanel";
import { DiffView } from "./components/DiffView";
import { BranchPanel } from "./components/BranchPanel";
import { WelcomePage } from "./components/WelcomePage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./components/ui/dialog";
import { Button } from "./components/ui/button";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport
} from "./components/ui/toast";
import type { WatcherStatus } from "./components/WatcherPill";
import { useAppStore } from "../state/store";
import {
  clAssignFiles,
  clAssignHunks,
  clCreate,
  clDelete,
  clList,
  clRename,
  clSetActive,
  clUnassignFiles,
  commitStaged,
  repoBranches,
  repoCheckout,
  repoDeleteUnversioned,
  repoFetch,
  repoListRecent,
  repoOpen,
  repoOpenWorktree,
  repoPull,
  repoPush,
  repoDiffPayload,
  repoStage,
  repoTrack,
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

const hasStagedChanges = (status: StatusFile["status"]) =>
  status === "staged" || status === "both";

const hasUnstagedChanges = (status: StatusFile["status"]) =>
  status === "unstaged" ||
  status === "untracked" ||
  status === "both" ||
  status === "conflicted";

const UNVERSIONED_LIST_ID = "unversioned-files";
const DEFAULT_CHANGE_LIST_ID = "default";

type ToastState = {
  id: number;
  kind: "success" | "error";
  title: string;
  description?: string;
};

const splitPath = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts.pop() ?? normalized;
  const dir = parts.join("/");
  return { name, dir };
};

const toErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};

const uniquePaths = (paths: string[]) => {
  const next = new Set<string>();
  const ordered: string[] = [];
  for (const rawPath of paths) {
    const path = rawPath.trim();
    if (!path || next.has(path)) continue;
    next.add(path);
    ordered.push(path);
  }
  return ordered;
};

export default function App() {
  const { repo, status, recent, setRepo, setRecent, setStatus } = useAppStore();
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [changelists, setChangelists] = useState<ChangelistState | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [repoBusy, setRepoBusy] = useState(false);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [branchBusy, setBranchBusy] = useState(false);
  const [fetchBusy, setFetchBusy] = useState(false);
  const [pullBusy, setPullBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
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
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitSelection, setCommitSelection] = useState<Set<string>>(new Set());
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

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
      setCommitDialogOpen(false);
      setCommitMessage("");
      setCommitSelection(new Set());
      setCommitBusy(false);
      setCommitError(null);
      setPullBusy(false);
      setPushBusy(false);
      return;
    }

    const repoId = repo.repo_id;
    let cancelled = false;

    const loadRepoData = async () => {
      try {
        const [nextStatus, nextBranches, nextChangelists] = await Promise.all([
          repoStatus(repoId),
          repoBranches(repoId),
          clList(repoId)
        ]);

        if (cancelled) return;
        setStatus(nextStatus);
        setBranches(nextBranches);
        setChangelists(nextChangelists);
      } catch (error) {
        if (!cancelled) console.error("initial repo load failed", error);
      }
    };

    loadRepoData();

    return () => {
      cancelled = true;
    };
  }, [repo?.repo_id, setStatus]);

  useEffect(() => {
    if (!repo?.repo_id) return;

    let cancelled = false;
    let dispose: (() => void) | null = null;
    let inFlight = false;
    let queued = false;

    const refresh = async () => {
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      try {
        do {
          queued = false;
          const [nextStatus, nextChangelists] = await Promise.all([
            repoStatus(repo.repo_id),
            clList(repo.repo_id)
          ]);
          if (cancelled) return;
          setStatus(nextStatus);
          setChangelists(nextChangelists);
          setWatcherStatus("active");
        } while (queued && !cancelled);
      } catch (error) {
        console.error("repo_changed refresh failed", error);
        if (!cancelled) setWatcherStatus("degraded");
      } finally {
        inFlight = false;
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
    if (!repo?.repo_id || watcherChannelReady) return;

    let cancelled = false;
    let inFlight = false;
    const intervalMs = 5000;

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
          setWatcherStatus("degraded");
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
    if (selectedChangelistId === UNVERSIONED_LIST_ID) return;
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
    setSelectedDiffKind((prev) => {
      if (prev === "staged" && !hasStagedChanges(matched.status)) {
        return "unstaged";
      }
      if (prev === "unstaged" && !hasUnstagedChanges(matched.status)) {
        return "staged";
      }
      return prev;
    });
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

  const stagedFiles = useMemo(() => {
    const files = (status?.files ?? []).filter((file) => hasStagedChanges(file.status));
    files.sort((a, b) => a.path.localeCompare(b.path));
    return files;
  }, [status?.files]);

  const selectedCommitPaths = useMemo(
    () => stagedFiles.filter((file) => commitSelection.has(file.path)).map((file) => file.path),
    [stagedFiles, commitSelection]
  );

  const showToast = (kind: ToastState["kind"], title: string, description?: string) => {
    setToast({
      id: Date.now(),
      kind,
      title,
      description
    });
  };

  useEffect(() => {
    if (!commitDialogOpen) return;
    if (stagedFiles.length === 0) {
      setCommitDialogOpen(false);
      setCommitError(null);
      return;
    }
    const stagedPathSet = new Set(stagedFiles.map((file) => file.path));
    setCommitSelection((prev) => {
      const next = new Set<string>();
      for (const path of prev) {
        if (stagedPathSet.has(path)) next.add(path);
      }
      return next;
    });
  }, [commitDialogOpen, stagedFiles]);

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
      const result = await repoFetch(repo.repo_id);
      const nextBranches = await repoBranches(repo.repo_id);
      setBranches(nextBranches);
      showToast(
        "success",
        "Fetch completed",
        result.updated
          ? `Fetched updates from ${result.remote}.`
          : `No updates found on ${result.remote}.`
      );
    } catch (error) {
      console.error("repo_fetch failed", error);
      showToast("error", "Fetch failed", toErrorMessage(error, "Fetch failed."));
    } finally {
      setFetchBusy(false);
    }
  };

  const handlePull = async () => {
    if (!repo?.repo_id) return;
    try {
      setPullBusy(true);
      const result = await repoPull(repo.repo_id);
      await Promise.all([refreshRepoData(repo.repo_id), repoBranches(repo.repo_id).then(setBranches)]);
      showToast(
        "success",
        "Pull completed",
        result.updated
          ? `Pulled latest changes from ${result.remote}.`
          : `Already up to date with ${result.remote}.`
      );
    } catch (error) {
      console.error("repo_pull failed", error);
      showToast("error", "Pull failed", toErrorMessage(error, "Pull failed."));
    } finally {
      setPullBusy(false);
    }
  };

  const handlePush = async () => {
    if (!repo?.repo_id) return;
    try {
      setPushBusy(true);
      const result = await repoPush(repo.repo_id);
      await Promise.all([refreshRepoData(repo.repo_id), repoBranches(repo.repo_id).then(setBranches)]);
      showToast(
        "success",
        "Push completed",
        result.updated
          ? `Pushed local commits to ${result.remote}.`
          : `Nothing to push to ${result.remote}.`
      );
    } catch (error) {
      console.error("repo_push failed", error);
      showToast("error", "Push failed", toErrorMessage(error, "Push failed."));
    } finally {
      setPushBusy(false);
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

  const openCommitDialog = () => {
    if (!repo?.repo_id) return;
    if (stagedFiles.length === 0) {
      showToast("error", "Commit failed", "No staged files to commit.");
      return;
    }
    setCommitMessage("");
    setCommitSelection(new Set(stagedFiles.map((file) => file.path)));
    setCommitError(null);
    setCommitDialogOpen(true);
  };

  const toggleCommitSelection = (path: string) => {
    setCommitSelection((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleCommit = async () => {
    if (!repo?.repo_id) return;
    if (!commitMessage.trim()) {
      setCommitError("Commit message is required.");
      return;
    }
    if (selectedCommitPaths.length === 0) {
      setCommitError("Select at least one file to commit.");
      return;
    }

    try {
      setCommitBusy(true);
      setCommitError(null);
      const result = await commitStaged(repo.repo_id, commitMessage.trim(), selectedCommitPaths);
      setCommitDialogOpen(false);
      setCommitMessage("");
      setCommitSelection(new Set());
      setCommitError(null);
      await Promise.all([refreshRepoData(repo.repo_id), repoBranches(repo.repo_id).then(setBranches)]);
      showToast(
        "success",
        "Commit successful",
        `${result.committed_paths.length} file${result.committed_paths.length === 1 ? "" : "s"} committed (${result.commit_id.slice(0, 7)}).`
      );
    } catch (error) {
      const message =
        typeof error === "string" ? error : (error as Error)?.message ?? "Commit failed.";
      setCommitError(message);
      showToast("error", "Commit failed", message);
    } finally {
      setCommitBusy(false);
    }
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
    const repoId = repo.repo_id;
    const latestChangelists = await clList(repoId);
    let targetId =
      id === latestChangelists.active_id
        ? DEFAULT_CHANGE_LIST_ID
        : latestChangelists.active_id ?? DEFAULT_CHANGE_LIST_ID;

    if (
      id === latestChangelists.active_id &&
      latestChangelists.active_id !== DEFAULT_CHANGE_LIST_ID
    ) {
      await clSetActive(repoId, DEFAULT_CHANGE_LIST_ID);
      targetId = DEFAULT_CHANGE_LIST_ID;
    }

    const pathsToMove = Object.entries(latestChangelists.assignments)
      .filter(([, assignedId]) => assignedId === id)
      .map(([path]) => path);

    if (pathsToMove.length > 0 && targetId !== id) {
      await clAssignFiles(repoId, targetId, pathsToMove);
    }

    const hunkAssignmentsToMove = Object.entries(latestChangelists.hunk_assignments).filter(
      ([, assignment]) => assignment.changelist_id === id
    );
    if (targetId !== id) {
      await Promise.all(
        hunkAssignmentsToMove.map(([path, assignment]) =>
          clAssignHunks(repoId, targetId, path, assignment.hunks)
        )
      );
    }

    await clDelete(repoId, id);
    if (selectedChangelistId === id) {
      setSelectedChangelistId(targetId);
    }
    await refreshRepoData(repoId);
  };

  const handleSetActiveChangelist = async (id: string) => {
    if (!repo?.repo_id) return;
    await clSetActive(repo.repo_id, id);
    const next = await clList(repo.repo_id);
    setChangelists(next);
  };

  const resolveActiveChangelistId = async (repoId: string) => {
    try {
      const latest = await clList(repoId);
      return latest.active_id ?? DEFAULT_CHANGE_LIST_ID;
    } catch (error) {
      console.error("cl_list failed while resolving active changelist", error);
      return DEFAULT_CHANGE_LIST_ID;
    }
  };

  const handleMovePathsToChangelist = async (paths: string[], targetId: string) => {
    if (!repo?.repo_id) return;
    const repoId = repo.repo_id;
    const nextPaths = uniquePaths(paths);
    if (nextPaths.length === 0) return;
    await clAssignFiles(repoId, targetId, nextPaths);
    await refreshRepoData(repoId);
  };

  const handleUnstageFilesToChangelist = async (paths: string[], targetId: string) => {
    if (!repo?.repo_id) return;
    const repoId = repo.repo_id;
    const stagedPathSet = new Set(
      (status?.files ?? [])
        .filter((file) => hasStagedChanges(file.status))
        .map((file) => file.path)
    );
    const nextPaths = uniquePaths(paths).filter((path) => stagedPathSet.has(path));
    if (nextPaths.length === 0) return;
    for (const path of nextPaths) {
      await repoUnstage(repoId, path);
    }
    await clAssignFiles(repoId, targetId, nextPaths);
    await refreshRepoData(repoId);
  };

  const handleStageFile = async (file: StatusFile) => {
    if (!repo?.repo_id) return;
    const repoId = repo.repo_id;
    try {
      setFileActionBusyPath(file.path);
      if (file.status === "untracked") {
        await repoTrack(repoId, file.path);
        try {
          const targetId = await resolveActiveChangelistId(repoId);
          await clAssignFiles(repoId, targetId, [file.path]);
        } catch (assignError) {
          console.error("cl_assign_files failed after stage", assignError);
        }
      } else {
        await repoStage(repoId, file.path);
      }
      await refreshRepoData(repoId);
    } catch (error) {
      console.error("repo_stage failed", error);
    } finally {
      setFileActionBusyPath(null);
    }
  };

  const handleStageAllInChangelist = async (changelistId: string) => {
    if (!repo?.repo_id || !status?.files) return;
    const repoId = repo.repo_id;
    const paths = uniquePaths(
      status.files
        .filter((file) => (file.changelist_id ?? DEFAULT_CHANGE_LIST_ID) === changelistId)
        .filter((file) => file.status === "unstaged" || file.status === "both")
        .map((file) => file.path)
    );
    if (paths.length === 0) return;
    for (const path of paths) {
      await repoStage(repoId, path);
    }
    await refreshRepoData(repoId);
  };

  const handleAddAllUnversioned = async () => {
    if (!repo?.repo_id || !status?.files) return;
    const repoId = repo.repo_id;
    const paths = uniquePaths(
      status.files
        .filter((file) => file.status === "untracked")
        .map((file) => file.path)
    );
    if (paths.length === 0) return;
    for (const path of paths) {
      await repoTrack(repoId, path);
    }
    const targetId = await resolveActiveChangelistId(repoId);
    await clAssignFiles(repoId, targetId, paths);
    await refreshRepoData(repoId);
  };

  const handleUnstageFile = async (file: StatusFile) => {
    if (!repo?.repo_id) return;
    const repoId = repo.repo_id;
    try {
      setFileActionBusyPath(file.path);
      const targetId = await resolveActiveChangelistId(repoId);
      await handleUnstageFilesToChangelist([file.path], targetId);
    } catch (error) {
      console.error("repo_unstage failed", error);
    } finally {
      setFileActionBusyPath(null);
    }
  };

  const handleDeleteUnversionedFile = async (path: string) => {
    if (!repo?.repo_id) return;
    const repoId = repo.repo_id;
    const nextPath = path.trim();
    if (!nextPath) return;
    await repoDeleteUnversioned(repoId, nextPath);
    try {
      await clUnassignFiles(repoId, [nextPath]);
    } catch (error) {
      console.error("cl_unassign_files failed after deleting unversioned file", error);
    }
    await refreshRepoData(repoId);
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
    <ToastProvider swipeDirection="right">
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
              pullBusy={pullBusy}
              pushBusy={pushBusy}
              commitBusy={commitBusy}
              commitDisabled={!repo || stagedFiles.length === 0}
              onOpenRepo={handleOpenRepoPicker}
              onSelectRecentRepo={handleSelectRecentRepo}
              onSelectWorktree={handleSelectWorktree}
              onFetch={handleFetch}
              onPull={handlePull}
              onPush={handlePush}
              onCommitClick={openCommitDialog}
            />

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 min-w-0 flex overflow-hidden">
              {/* Left Nav Panel */}
              <LeftNavPanel
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
                  onStageAllInChangelist={handleStageAllInChangelist}
                  onAddAllUnversioned={handleAddAllUnversioned}
                  onMovePathsToChangelist={handleMovePathsToChangelist}
                  onUnstageFilesToChangelist={handleUnstageFilesToChangelist}
                  onDeleteUnversionedFile={handleDeleteUnversionedFile}
                  fileActionBusyPath={fileActionBusyPath}
                  onFileSelect={handleSelectStatusFile}
                  selectedFile={selectedFile}
                  selectedDiffKind={selectedDiffKind}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  showHunks={showHunks}
                  onShowHunksChange={setShowHunks}
                />
              )}

              {/* Center - Diff View */}
              {selectedFile ? (
                <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
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

      <Dialog
        open={commitDialogOpen}
        onOpenChange={(open) => {
          setCommitDialogOpen(open);
          if (!open) {
            setCommitError(null);
          }
        }}
      >
        <DialogContent
          className="max-w-none sm:!max-w-none bg-[#3c3f41] border-[#323232] text-[#bbbbbb] flex flex-col"
          style={{
            width: "60vw",
            maxWidth: "60vw",
            height: "min(88vh, 920px)"
          }}
        >
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>Commit staged files</DialogTitle>
            <DialogDescription className="text-[#787878]">
              Select staged files and provide a commit message.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="flex-1 min-h-0 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-[#787878]">Staged files</div>
                <div className="text-xs text-[#787878]">
                  {selectedCommitPaths.length} of {stagedFiles.length} selected
                </div>
              </div>
              <div className="h-full min-h-0 overflow-y-auto rounded border border-[#323232] bg-[#2b2b2b]">
                {stagedFiles.length === 0 ? (
                  <div className="p-3 text-sm text-[#787878]">No staged files.</div>
                ) : (
                  <div className="divide-y divide-[#323232]">
                    {stagedFiles.map((file) => {
                      const checked = commitSelection.has(file.path);
                      const { name, dir } = splitPath(file.path);
                      return (
                        <label
                          key={file.path}
                          className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-[#333638] ${checked ? "bg-[#333638]" : ""}`}
                          data-testid={`commit-file:${file.path}`}
                          title={file.path}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCommitSelection(file.path)}
                            disabled={commitBusy}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm text-[#bbbbbb]">
                            {name}
                            {dir ? <span className="text-[#787878]">{`  -  ${dir}`}</span> : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2 shrink-0">
              <label htmlFor="commit-message" className="text-xs uppercase tracking-wide text-[#787878]">
                Commit message
              </label>
              <textarea
                id="commit-message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                rows={5}
                disabled={commitBusy}
                className="w-full min-h-28 max-h-56 resize-y rounded border border-[#323232] bg-[#2b2b2b] px-3 py-2 text-sm text-[#bbbbbb] focus:border-[#4e5254] focus:outline-none"
                placeholder="Write commit message"
              />
            </div>

            {commitError && (
              <div className="rounded border border-[#6d2f2f] bg-[#4b2a2a] px-3 py-2 text-sm text-[#f2b8b5]">
                {commitError}
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t border-[#323232] pt-4">
            <Button
              variant="outline"
              onClick={() => setCommitDialogOpen(false)}
              disabled={commitBusy}
              className="border-[#4d4d4d] bg-transparent text-[#bbbbbb] hover:bg-[#4e5254]"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCommit}
              disabled={
                commitBusy ||
                !commitMessage.trim() ||
                selectedCommitPaths.length === 0 ||
                stagedFiles.length === 0
              }
              className="bg-[#4e5254] text-[#bbbbbb] hover:bg-[#5a5e60]"
            >
              {commitBusy ? "Committing..." : "Commit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && (
        <Toast
          key={toast.id}
          open
          onOpenChange={(open) => {
            if (!open) setToast(null);
          }}
          duration={toast.kind === "error" ? 6000 : 3500}
          className={
            toast.kind === "error"
              ? "border-[#6d2f2f] bg-[#4b2a2a] text-[#f2b8b5]"
              : "border-[#2f5d45] bg-[#2f473a] text-[#bbf7d0]"
          }
        >
          <ToastTitle>{toast.title}</ToastTitle>
          {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
          <ToastClose />
        </Toast>
      )}
      <ToastViewport />
    </ToastProvider>
  );
}
