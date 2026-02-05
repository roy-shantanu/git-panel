import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Diff, Hunk, parseDiff } from "react-diff-view";
import "react-diff-view/style/index.css";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../components/ui/alert-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../components/ui/select";
import { useTheme } from "../components/ThemeProvider";
import {
  clAssignFiles,
  clAssignHunks,
  clCreate,
  clDelete,
  clList,
  clRename,
  clSetActive,
  clUnassignFiles,
  clUnassignHunks,
  commitExecute,
  commitPrepare,
  repoBranches,
  repoCheckout,
  repoCreateBranch,
  repoDiff,
  repoDiffHunks,
  repoFetch,
  repoListRecent,
  repoOpen,
  repoOpenWorktree,
  repoStage,
  repoStatus,
  repoUnstage,
  wtAdd,
  wtList,
  wtPrune,
  wtRemove
} from "../api/tauri";
import { getIconForFilePath, getIconUrlForFilePath } from "vscode-material-icons";
import { useAppStore } from "../state/store";
import type {
  BranchList,
  Changelist,
  ChangelistState,
  CommitPreview,
  DiffHunk,
  RepoDiffKind,
  RepoError,
  StatusFile,
  WorktreeInfo
} from "../types/ipc";

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

const splitPath = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts.pop() ?? normalized;
  const dir = parts.join("/");
  return { name, dir };
};

const isStagedStatus = (status: StatusFile["status"]) =>
  status === "staged" || status === "both";

const isUnstagedStatus = (status: StatusFile["status"]) =>
  status === "unstaged" ||
  status === "untracked" ||
  status === "both" ||
  status === "conflicted";

type FileIconInfo = {
  className: string;
  url: string;
};

const ICONS_URL = "/material-icons";
const STAGED_LIST_ID = "staged";

const getFileIconInfo = (path: string): FileIconInfo => {
  const iconName = getIconForFilePath(path);
  return {
    className: `ext-${iconName}`,
    url: getIconUrlForFilePath(path, ICONS_URL)
  };
};

export default function RepositoryPicker() {
  const { repo, status, recent, setRepo, setStatus, setRecent } = useAppStore();
  const { theme, setTheme } = useTheme();
  const [polling, setPolling] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<StatusFile | null>(null);
  const [diffKind, setDiffKind] = useState<RepoDiffKind>("unstaged");
  const [diffText, setDiffText] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffHunks, setDiffHunks] = useState<DiffHunk[]>([]);
  const [diffHunkError, setDiffHunkError] = useState<string | null>(null);
  const [selectedHunkIds, setSelectedHunkIds] = useState<Set<string>>(new Set());
  const [hunkBusy, setHunkBusy] = useState(false);
  const [hunkSelectionEnabled, setHunkSelectionEnabled] = useState(true);
  const [branches, setBranches] = useState<BranchList | null>(null);
  const [branchBusy, setBranchBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [changelists, setChangelists] = useState<ChangelistState | null>(null);
  const [selectedChangelistId, setSelectedChangelistId] = useState<string>("default");
  const [collapsedChangelists, setCollapsedChangelists] = useState<Set<string>>(
    new Set()
  );
  const [changelistNavCollapsed, setChangelistNavCollapsed] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [commitPreview, setCommitPreview] = useState<CommitPreview | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitAmend, setCommitAmend] = useState(false);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitSelection, setCommitSelection] = useState<Set<string>>(new Set());
  const [fileActionBusy, setFileActionBusy] = useState<string | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [worktreeBusy, setWorktreeBusy] = useState(false);
  const [infoDialog, setInfoDialog] = useState<{
    title: string;
    description: string;
  } | null>(null);
  const [worktreeDialogOpen, setWorktreeDialogOpen] = useState(false);
  const [worktreePath, setWorktreePath] = useState("");
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [worktreeCreateBranch, setWorktreeCreateBranch] = useState(false);
  const [worktreeDialogError, setWorktreeDialogError] = useState<string | null>(null);
  const [removeWorktreeOpen, setRemoveWorktreeOpen] = useState(false);
  const [createBranchOpen, setCreateBranchOpen] = useState(false);
  const [createBranchName, setCreateBranchName] = useState("");
  const [createBranchError, setCreateBranchError] = useState<string | null>(null);
  const [createChangelistOpen, setCreateChangelistOpen] = useState(false);
  const [createChangelistName, setCreateChangelistName] = useState("");
  const [createChangelistError, setCreateChangelistError] = useState<string | null>(null);
  const [renameChangelistTarget, setRenameChangelistTarget] = useState<Changelist | null>(null);
  const [renameChangelistName, setRenameChangelistName] = useState("");
  const [renameChangelistError, setRenameChangelistError] = useState<string | null>(null);
  const [deleteChangelistTarget, setDeleteChangelistTarget] =
    useState<Changelist | null>(null);

  const files = status?.files ?? [];
  const stagedFiles = useMemo(() => {
    const list = files.filter((file) => isStagedStatus(file.status));
    list.sort((a, b) => a.path.localeCompare(b.path));
    return list;
  }, [files]);
  const filesByChangelist = useMemo(() => {
    const map = new Map<string, StatusFile[]>();
    for (const file of files) {
      const key = file.changelist_id ?? "default";
      const list = map.get(key);
      if (list) {
        list.push(file);
      } else {
        map.set(key, [file]);
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.path.localeCompare(b.path));
    }
    return map;
  }, [files]);

  const unstagedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) {
      if (!isUnstagedStatus(file.status)) continue;
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
    setHunkSelectionEnabled(true);
    setCommitMessage("");
    setCommitPreview(null);
    setCommitError(null);
    setCommitAmend(false);
    setWorktrees([]);
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

    const unlisten = listen<string>("repo_changed", (event) => {
      if (event.payload === repo.repo_id) {
        fetchStatus();
      }
    });

    return () => {
      cancelled = true;
      setPolling(false);
      unlisten.then((fn) => fn()).catch(console.error);
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
    if (!repo?.repo_root) {
      setWorktrees([]);
      return;
    }
    wtList(repo.repo_root)
      .then((result) => setWorktrees(result.worktrees))
      .catch((error) => console.error("wt_list failed", error));
  }, [repo?.repo_root]);

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
    if (!repo?.repo_id || !selectedPath) {
      setDiffHunks([]);
      setSelectedHunkIds(new Set());
      setDiffHunkError(null);
      return;
    }

    let cancelled = false;
    setDiffHunkError(null);
    repoDiffHunks(repo.repo_id, selectedPath, diffKind)
      .then((next) => {
        if (!cancelled) {
          setDiffHunks(next);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message =
            typeof error === "string"
              ? error
              : (error as Error)?.message ?? "Diff hunks failed.";
          setDiffHunkError(message);
          setDiffHunks([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [repo?.repo_id, selectedPath, diffKind]);

  useEffect(() => {
    if (!hunkSelectionEnabled) {
      setSelectedHunkIds(new Set());
    }
  }, [hunkSelectionEnabled]);

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

  useEffect(() => {
    if (!commitPreview) {
      setCommitSelection(new Set());
      return;
    }
    if (!commitDialogOpen) {
      setCommitSelection(new Set(commitPreview.files.map((file) => file.path)));
    }
  }, [commitPreview, commitDialogOpen]);

  const activeHunkAssignment = useMemo(() => {
    if (!selectedPath) return null;
    return changelists?.hunk_assignments?.[selectedPath] ?? null;
  }, [changelists, selectedPath]);

  const assignedHunkIds = useMemo(() => {
    if (!activeHunkAssignment) return new Set<string>();
    if (activeHunkAssignment.changelist_id !== selectedChangelistId) {
      return new Set<string>();
    }
    return new Set(activeHunkAssignment.hunks.map((hunk) => hunk.id));
  }, [activeHunkAssignment, selectedChangelistId]);

  const invalidAssignedHunks = useMemo(() => {
    if (!activeHunkAssignment) return [];
    if (activeHunkAssignment.changelist_id !== selectedChangelistId) return [];
    const diffMap = new Map(diffHunks.map((hunk) => [hunk.id, hunk.content_hash]));
    return activeHunkAssignment.hunks.filter(
      (hunk) => diffMap.get(hunk.id) !== hunk.content_hash
    );
  }, [activeHunkAssignment, selectedChangelistId, diffHunks]);

  useEffect(() => {
    setSelectedHunkIds(new Set(assignedHunkIds));
  }, [assignedHunkIds, diffHunks]);

  const handlePick = async () => {
    if (!isTauri) {
      console.warn("File picker requires the Tauri app runtime.");
      setInfoDialog({
        title: "Run in Tauri",
        description:
          "The native folder picker only works in the Tauri app. Run npm run tauri dev."
      });
      return;
    }

    let selection: string | string[] | null = null;
    try {
      selection = await open({ directory: true, multiple: false });
    } catch (error) {
      console.error("dialog.open failed", error);
      setInfoDialog({
        title: "Folder Picker Failed",
        description: "Could not open the folder picker. Check the console for details."
      });
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
      if (summary.repo_root) {
        const wt = await wtList(summary.repo_root);
        setWorktrees(wt.worktrees);
      }
    } catch (error) {
      console.error("repo_open failed", error);
    }
  };

  const handleSelectWorktree = async (path: string) => {
    if (!repo || path === repo.worktree_path) return;
    setWorktreeBusy(true);
    try {
      const summary = await repoOpenWorktree(repo.repo_root, path);
      setRepo(summary);
      const next = await repoStatus(summary.repo_id);
      setStatus(next);
      const clState = await clList(summary.repo_id);
      setChangelists(clState);
      const branchList = await repoBranches(summary.repo_id);
      setBranches(branchList);
    } catch (error) {
      console.error("repo_open_worktree failed", error);
      setToast("Worktree switch failed.");
    } finally {
      setWorktreeBusy(false);
    }
  };

  const handleAddWorktree = () => {
    if (!repo) return;
    setWorktreePath("");
    setWorktreeBranch("");
    setWorktreeCreateBranch(false);
    setWorktreeDialogError(null);
    setWorktreeDialogOpen(true);
  };

  const handleRemoveWorktree = () => {
    if (!repo) return;
    setRemoveWorktreeOpen(true);
  };

  const handlePruneWorktrees = async () => {
    if (!repo) return;
    setWorktreeBusy(true);
    try {
      await wtPrune(repo.repo_root);
      const wt = await wtList(repo.repo_root);
      setWorktrees(wt.worktrees);
      setToast("Worktrees pruned.");
    } catch (error) {
      console.error("wt_prune failed", error);
      setToast("Prune failed.");
    } finally {
      setWorktreeBusy(false);
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

  const handleCreateBranch = () => {
    if (!repo) return;
    setCreateBranchName("");
    setCreateBranchError(null);
    setCreateBranchOpen(true);
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

  const handleCreateChangelist = () => {
    if (!repo) return;
    setCreateChangelistName("");
    setCreateChangelistError(null);
    setCreateChangelistOpen(true);
  };

  const handleRenameChangelist = (list: Changelist) => {
    if (!repo) return;
    setRenameChangelistTarget(list);
    setRenameChangelistName(list.name);
    setRenameChangelistError(null);
  };

  const handleDeleteChangelist = (list: Changelist) => {
    if (!repo) return;
    setDeleteChangelistTarget(list);
  };

  const confirmAddWorktree = async () => {
    if (!repo) return;
    const path = worktreePath.trim();
    const branchName = worktreeBranch.trim();
    if (!path || !branchName) {
      setWorktreeDialogError("Path and branch name are required.");
      return;
    }
    setWorktreeBusy(true);
    try {
      await wtAdd(repo.repo_root, path, branchName, worktreeCreateBranch);
      const wt = await wtList(repo.repo_root);
      setWorktrees(wt.worktrees);
      await handleSelectWorktree(path);
      setToast("Worktree added.");
      setWorktreeDialogOpen(false);
    } catch (error) {
      console.error("wt_add failed", error);
      setWorktreeDialogError("Add worktree failed.");
      setToast("Add worktree failed.");
    } finally {
      setWorktreeBusy(false);
    }
  };

  const handleSelectRecent = async (path: string) => {
    if (!path) return;
    try {
      const summary = await repoOpen(path);
      setRepo(summary);
      const recents = await repoListRecent();
      setRecent(recents);
    } catch (error) {
      console.error("repo_open failed", error);
      setToast("Open repository failed.");
    }
  };

  const confirmRemoveWorktree = async () => {
    if (!repo) return;
    setWorktreeBusy(true);
    try {
      await wtRemove(repo.repo_root, repo.worktree_path);
      const wt = await wtList(repo.repo_root);
      setWorktrees(wt.worktrees);
      const nextPath = wt.worktrees[0]?.path;
      if (nextPath) {
        await handleSelectWorktree(nextPath);
      }
      setToast("Worktree removed.");
      setRemoveWorktreeOpen(false);
    } catch (error) {
      console.error("wt_remove failed", error);
      setToast("Remove worktree failed.");
    } finally {
      setWorktreeBusy(false);
    }
  };

  const confirmCreateBranch = async () => {
    if (!repo) return;
    const name = createBranchName.trim();
    if (!name) {
      setCreateBranchError("Branch name is required.");
      return;
    }
    try {
      await repoCreateBranch(repo.repo_id, name);
      setCreateBranchOpen(false);
      setCreateBranchName("");
      setCreateBranchError(null);
      await handleCheckout("local", name);
    } catch (error) {
      setCreateBranchError("Create branch failed. See console for details.");
      setToast("Create branch failed. See console for details.");
      console.error("repo_create_branch failed", error);
    }
  };

  const confirmCreateChangelist = async () => {
    if (!repo) return;
    const name = createChangelistName.trim();
    if (!name) {
      setCreateChangelistError("Changelist name is required.");
      return;
    }
    try {
      await clCreate(repo.repo_id, name);
      await refreshChangelists();
      setCreateChangelistOpen(false);
      setCreateChangelistName("");
      setCreateChangelistError(null);
    } catch (error) {
      console.error("cl_create failed", error);
      setCreateChangelistError("Create changelist failed.");
      setToast("Create changelist failed.");
    }
  };

  const confirmRenameChangelist = async () => {
    if (!repo || !renameChangelistTarget) return;
    const name = renameChangelistName.trim();
    if (!name) {
      setRenameChangelistError("Changelist name is required.");
      return;
    }
    if (name === renameChangelistTarget.name) {
      setRenameChangelistError("Name is unchanged.");
      return;
    }
    try {
      await clRename(repo.repo_id, renameChangelistTarget.id, name);
      await refreshChangelists();
      setRenameChangelistTarget(null);
      setRenameChangelistName("");
      setRenameChangelistError(null);
    } catch (error) {
      console.error("cl_rename failed", error);
      setRenameChangelistError("Rename changelist failed.");
      setToast("Rename changelist failed.");
    }
  };

  const confirmDeleteChangelist = async () => {
    if (!repo || !deleteChangelistTarget) return;
    try {
      await clDelete(repo.repo_id, deleteChangelistTarget.id);
      if (selectedChangelistId === deleteChangelistTarget.id) {
        setSelectedChangelistId("default");
      }
      await refreshChangelists();
      setDeleteChangelistTarget(null);
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

  const handleCommit = async () => {
    if (!repo) return;
    if (!commitMessage.trim()) {
      setCommitError("Commit message is required.");
      return;
    }
    if (!commitPreview) {
      setCommitError("No files to commit.");
      return;
    }

    const selectedPaths = commitPreview.files
      .filter((file) => commitSelection.has(file.path))
      .map((file) => file.path);
    if (selectedPaths.length === 0) {
      setCommitError("Select at least one file to commit.");
      return;
    }

    const excludedPaths = commitPreview.files
      .filter((file) => !commitSelection.has(file.path))
      .map((file) => file.path);
    let tempChangelist: Changelist | null = null;

    const restoreExcluded = async () => {
      if (excludedPaths.length === 0) return;
      try {
        const nextStatus = await repoStatus(repo.repo_id);
        const remaining = excludedPaths.filter((path) =>
          nextStatus.files.some((file) => file.path === path)
        );
        if (remaining.length > 0) {
          const targetId = selectedChangelistId === "default" ? "default" : selectedChangelistId;
          await clAssignFiles(repo.repo_id, targetId, remaining);
        }
        setStatus(nextStatus);
      } catch (error) {
        console.error("restore excluded files failed", error);
      }
      if (tempChangelist) {
        try {
          await clDelete(repo.repo_id, tempChangelist.id);
        } catch (error) {
          console.error("delete temp changelist failed", error);
        }
      }
    };

    setCommitBusy(true);
    setCommitError(null);
    try {
      if (excludedPaths.length > 0) {
        if (selectedChangelistId === "default") {
          const tempName = `Skipped files ${Date.now()}`;
          tempChangelist = await clCreate(repo.repo_id, tempName);
          await clAssignFiles(repo.repo_id, tempChangelist.id, excludedPaths);
        } else {
          await clUnassignFiles(repo.repo_id, excludedPaths);
        }
      }
      await commitExecute(repo.repo_id, selectedChangelistId, commitMessage.trim(), {
        amend: commitAmend
      });
      await restoreExcluded();
      setCommitMessage("");
      setCommitPreview(null);
      setCommitError(null);
      setCommitAmend(false);
      setCommitDialogOpen(false);
      await handleRefresh();
      setToast("Commit successful.");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : (error as Error)?.message ?? "Commit failed.";
      setCommitError(message);
      setToast("Commit failed.");
      await restoreExcluded();
    } finally {
      setCommitBusy(false);
    }
  };

  const toggleHunk = (id: string) => {
    setSelectedHunkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAssignHunks = async () => {
    if (!repo || !selectedPath) return;
    const hunks = diffHunks.filter((hunk) => selectedHunkIds.has(hunk.id));
    if (hunks.length === 0) {
      setToast("Select hunks to assign.");
      return;
    }
    setHunkBusy(true);
    try {
      await clAssignHunks(
        repo.repo_id,
        selectedChangelistId,
        selectedPath,
        hunks.map((hunk) => ({
          id: hunk.id,
          header: hunk.header,
          old_start: hunk.old_start,
          old_lines: hunk.old_lines,
          new_start: hunk.new_start,
          new_lines: hunk.new_lines,
          content_hash: hunk.content_hash,
          kind: hunk.kind
        }))
      );
      await handleRefresh();
      setToast("Hunks assigned.");
    } catch (error) {
      console.error("cl_assign_hunks failed", error);
      setToast("Assign hunks failed.");
    } finally {
      setHunkBusy(false);
    }
  };

  const handleUnassignHunks = async () => {
    if (!repo || !selectedPath) return;
    if (!activeHunkAssignment || activeHunkAssignment.changelist_id !== selectedChangelistId) {
      return;
    }
    setHunkBusy(true);
    try {
      await clUnassignHunks(
        repo.repo_id,
        selectedPath,
        activeHunkAssignment.hunks.map((hunk) => hunk.id)
      );
      await handleRefresh();
      setToast("Hunks cleared.");
    } catch (error) {
      console.error("cl_unassign_hunks failed", error);
      setToast("Clear hunks failed.");
    } finally {
      setHunkBusy(false);
    }
  };

  const toggleChangelistCollapse = (id: string) => {
    setCollapsedChangelists((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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

  const handleStageFile = async (file: StatusFile) => {
    if (!repo) return;
    setFileActionBusy(file.path);
    try {
      await repoStage(repo.repo_id, file.path);
      const nextStatus = await repoStatus(repo.repo_id);
      setStatus(nextStatus);
      const clState = await clList(repo.repo_id);
      setChangelists(clState);
      setToast("File staged.");
    } catch (error) {
      console.error("repo_stage failed", error);
      setToast("Stage failed.");
    } finally {
      setFileActionBusy(null);
    }
  };

  const handleUnstageFile = async (file: StatusFile) => {
    if (!repo) return;
    setFileActionBusy(file.path);
    try {
      await repoUnstage(repo.repo_id, file.path);
      let nextStatus = await repoStatus(repo.repo_id);
      if (
        changelists &&
        nextStatus.files.some((item) => item.path === file.path)
      ) {
        const targetId = changelists.active_id ?? "default";
        await clAssignFiles(repo.repo_id, targetId, [file.path]);
        nextStatus = await repoStatus(repo.repo_id);
      }
      setStatus(nextStatus);
      const clState = await clList(repo.repo_id);
      setChangelists(clState);
      setToast("File unstaged.");
    } catch (error) {
      console.error("repo_unstage failed", error);
      setToast("Unstage failed.");
    } finally {
      setFileActionBusy(null);
    }
  };

  const handleSelectFile = (file: StatusFile, kind: RepoDiffKind) => {
    setSelectedFile(file);
    setSelectedPath(file.path);
    setDiffKind(kind);
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

  const { parsedDiff, diffParseError } = useMemo(() => {
    if (!diffText) return { parsedDiff: [], diffParseError: null };
    try {
      return { parsedDiff: parseDiff(diffText), diffParseError: null };
    } catch (error) {
      console.error("parseDiff failed", error);
      return { parsedDiff: [], diffParseError: "Diff could not be parsed." };
    }
  }, [diffText]);

  const hunkIdByHeader = useMemo(() => {
    const map = new Map<string, string>();
    for (const hunk of diffHunks) {
      map.set(hunk.header, hunk.id);
    }
    return map;
  }, [diffHunks]);

  return (
    <div className="ide-shell">
      <aside className="ide-sidebar">
        <div className="nav-section">
          <button className="nav-icon active" aria-label="Repository">
            RP
          </button>
          <button
            className="nav-icon"
            aria-label="Toggle changelist panel"
            aria-pressed={!changelistNavCollapsed}
            onClick={() => setChangelistNavCollapsed((prev) => !prev)}
          >
            CL
          </button>
          <button className="nav-icon" aria-label="Diffs">
            DF
          </button>
        </div>
        <div className="nav-section">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="nav-icon" aria-label="Settings">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm9.2 3.4c0-.5-.1-1-.2-1.4l2-1.6-1.9-3.3-2.4.9a7.8 7.8 0 0 0-2.4-1.4L14.9 2H9.1L8.7 5.2c-.8.3-1.6.7-2.4 1.4l-2.4-.9-1.9 3.3 2 1.6c-.1.5-.2 1-.2 1.4 0 .5.1 1 .2 1.4l-2 1.6 1.9 3.3 2.4-.9c.8.7 1.6 1.1 2.4 1.4l.4 3.2h5.8l.4-3.2c.8-.3 1.6-.7 2.4-1.4l2.4.9 1.9-3.3-2-1.6c.1-.5.2-1 .2-1.4Z"
                  />
                </svg>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              <DropdownMenuLabel>Theme</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={theme === "light"}
                onCheckedChange={(checked) => {
                  if (checked) setTheme("light");
                }}
              >
                Light
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "dark"}
                onCheckedChange={(checked) => {
                  if (checked) setTheme("dark");
                }}
              >
                Dark
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "solarized-light"}
                onCheckedChange={(checked) => {
                  if (checked) setTheme("solarized-light");
                }}
              >
                Solarized light
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={theme === "paper"}
                onCheckedChange={(checked) => {
                  if (checked) setTheme("paper");
                }}
              >
                Paper
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="ide-main">
        {toast && <div className="toast toast-floating">{toast}</div>}
      <Dialog
        open={!!infoDialog}
        onOpenChange={(open) => {
          if (!open) setInfoDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{infoDialog?.title}</DialogTitle>
            <DialogDescription>{infoDialog?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button">OK</button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={worktreeDialogOpen}
        onOpenChange={(open) => {
          setWorktreeDialogOpen(open);
          if (!open) {
            setWorktreeDialogError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Worktree</DialogTitle>
            <DialogDescription>
              Add a new worktree path and branch. You can create a new branch
              at the same time.
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-form">
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="worktree-path">
                Worktree path
              </label>
              <Input
                id="worktree-path"
                placeholder="C:\\path\\to\\worktree"
                value={worktreePath}
                onChange={(event) => {
                  setWorktreePath(event.target.value);
                  if (worktreeDialogError) setWorktreeDialogError(null);
                }}
              />
            </div>
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="worktree-branch">
                Branch name
              </label>
              <Input
                id="worktree-branch"
                placeholder="feature/my-branch"
                value={worktreeBranch}
                onChange={(event) => {
                  setWorktreeBranch(event.target.value);
                  if (worktreeDialogError) setWorktreeDialogError(null);
                }}
              />
            </div>
            <label className="commit-checkbox">
              <input
                type="checkbox"
                checked={worktreeCreateBranch}
                onChange={(event) => setWorktreeCreateBranch(event.target.checked)}
              />
              Create new branch for worktree
            </label>
            {worktreeDialogError && (
              <div className="dialog-error">{worktreeDialogError}</div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button secondary" disabled={worktreeBusy}>
                Cancel
              </button>
            </DialogClose>
            <button className="button" onClick={confirmAddWorktree} disabled={worktreeBusy}>
              {worktreeBusy ? "Adding..." : "Add worktree"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createBranchOpen}
        onOpenChange={(open) => {
          setCreateBranchOpen(open);
          if (!open) {
            setCreateBranchError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Branch</DialogTitle>
            <DialogDescription>Enter a new branch name.</DialogDescription>
          </DialogHeader>
          <div className="dialog-form">
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="create-branch-name">
                Branch name
              </label>
              <Input
                id="create-branch-name"
                placeholder="feature/my-branch"
                value={createBranchName}
                onChange={(event) => {
                  setCreateBranchName(event.target.value);
                  if (createBranchError) setCreateBranchError(null);
                }}
              />
            </div>
            {createBranchError && <div className="dialog-error">{createBranchError}</div>}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button secondary">Cancel</button>
            </DialogClose>
            <button className="button" onClick={confirmCreateBranch}>
              Create branch
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createChangelistOpen}
        onOpenChange={(open) => {
          setCreateChangelistOpen(open);
          if (!open) {
            setCreateChangelistError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Changelist</DialogTitle>
            <DialogDescription>Name the new changelist.</DialogDescription>
          </DialogHeader>
          <div className="dialog-form">
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="create-changelist-name">
                Changelist name
              </label>
              <Input
                id="create-changelist-name"
                placeholder="UI polish"
                value={createChangelistName}
                onChange={(event) => {
                  setCreateChangelistName(event.target.value);
                  if (createChangelistError) setCreateChangelistError(null);
                }}
              />
            </div>
            {createChangelistError && (
              <div className="dialog-error">{createChangelistError}</div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button secondary">Cancel</button>
            </DialogClose>
            <button className="button" onClick={confirmCreateChangelist}>
              Create changelist
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameChangelistTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameChangelistTarget(null);
            setRenameChangelistName("");
            setRenameChangelistError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Changelist</DialogTitle>
            <DialogDescription>
              Update the name for {renameChangelistTarget?.name ?? "this changelist"}.
            </DialogDescription>
          </DialogHeader>
          <div className="dialog-form">
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="rename-changelist-name">
                New name
              </label>
              <Input
                id="rename-changelist-name"
                value={renameChangelistName}
                onChange={(event) => {
                  setRenameChangelistName(event.target.value);
                  if (renameChangelistError) setRenameChangelistError(null);
                }}
              />
            </div>
            {renameChangelistError && (
              <div className="dialog-error">{renameChangelistError}</div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button secondary">Cancel</button>
            </DialogClose>
            <button className="button" onClick={confirmRenameChangelist}>
              Rename
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={commitDialogOpen}
        onOpenChange={(open) => {
          setCommitDialogOpen(open);
          if (!open) {
            setCommitError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Commit staged files</DialogTitle>
            <DialogDescription>
              {changelistItems.find((item) => item.id === selectedChangelistId)?.name ??
                "Changelist"}
            </DialogDescription>
          </DialogHeader>
          <div className="commit-dialog">
            <div className="dialog-field">
              <label className="dialog-label" htmlFor="commit-message">
                Commit message
              </label>
              <textarea
                id="commit-message"
                className="commit-input"
                placeholder="Commit message"
                value={commitMessage}
                onChange={(event) => setCommitMessage(event.target.value)}
                rows={3}
              />
            </div>
            <label className="commit-checkbox">
              <input
                type="checkbox"
                checked={commitAmend}
                onChange={(event) => setCommitAmend(event.target.checked)}
              />
              Amend previous commit
            </label>
            {commitError && <div className="commit-error">{commitError}</div>}
            {commitPreview && commitPreview.invalid_hunks.length > 0 && (
              <div className="commit-error">Some hunks need reselect before committing.</div>
            )}
            {commitPreview && commitPreview.warnings.length > 0 && (
              <ul className="commit-warnings">
                {commitPreview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            )}
            <div className="commit-dialog-list">
              {commitLoading ? (
                <div className="muted">Previewing…</div>
              ) : commitPreview ? (
                commitPreview.files.length === 0 ? (
                  <div className="muted">No files to commit.</div>
                ) : (
                  <div className="commit-file-list">
                    {commitPreview.files.map((file) => {
                      const { name, dir } = splitPath(file.path);
                      const icon = getFileIconInfo(file.path);
                      return (
                        <label key={file.path} className="commit-file-row">
                          <input
                            type="checkbox"
                            checked={commitSelection.has(file.path)}
                            onChange={() => toggleCommitSelection(file.path)}
                          />
                          <span className="commit-file-text">
                            <img
                              className={`file-icon ${icon.className}`}
                              src={icon.url}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                            />
                            <span className="file-name">{name}</span>
                            {dir && <span className="file-dir">{dir}</span>}
                          </span>
                          <span className="commit-file-status">{file.status}</span>
                        </label>
                      );
                    })}
                  </div>
                )
              ) : (
                <div className="muted">No preview available.</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <button className="button secondary" disabled={commitBusy}>
                Cancel
              </button>
            </DialogClose>
            <button
              className="button"
              onClick={handleCommit}
              disabled={
                commitBusy ||
                commitLoading ||
                !commitPreview ||
                !commitMessage.trim() ||
                commitSelection.size === 0 ||
                (commitPreview?.invalid_hunks.length ?? 0) > 0
              }
            >
              {commitBusy ? "Committing…" : "Commit"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removeWorktreeOpen}
        onOpenChange={(open) => {
          if (!open) setRemoveWorktreeOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Worktree</AlertDialogTitle>
            <AlertDialogDescription>
              Remove worktree at {repo?.worktree_path}? This will prune it from the list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button className="button secondary" disabled={worktreeBusy}>
                Cancel
              </button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button className="button" onClick={confirmRemoveWorktree} disabled={worktreeBusy}>
                Remove
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!deleteChangelistTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteChangelistTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Changelist</AlertDialogTitle>
            <AlertDialogDescription>
              Delete changelist "{deleteChangelistTarget?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <button className="button secondary">Cancel</button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <button className="button" onClick={confirmDeleteChangelist}>
                Delete
              </button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="ide-topbar">
        <div className="repo-controls">
          <button className="button" onClick={handlePick}>
            {repo ? "Open Another" : "Open Repo"}
          </button>
          <Select
            value={repo?.path ?? ""}
            onValueChange={handleSelectRecent}
            disabled={recent.length === 0}
          >
            <SelectTrigger className="select-trigger">
              <SelectValue className="select-value" placeholder="Recent repositories" />
            </SelectTrigger>
            <SelectContent>
              {recent.map((item) => (
                <SelectItem key={item.repo_id} value={item.path} textValue={item.name}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="repo-meta">
            <div className="repo-title">{repo?.name ?? "No repository selected"}</div>
            <div className="repo-path">
              {repo?.path ?? "Open a repository to start working."}
            </div>
          </div>
        </div>
        <div className="top-actions">
          <button className="button secondary" onClick={handleRefresh} disabled={!repo}>
            Refresh
          </button>
          <button
            className="button secondary"
            onClick={handleCreateBranch}
            disabled={!repo || branchBusy}
          >
            New Branch
          </button>
          <button
            className="button secondary"
            onClick={handleFetch}
            disabled={!repo || branchBusy}
          >
            Fetch
          </button>
          <button
            className="button secondary"
            onClick={handleAddWorktree}
            disabled={!repo || worktreeBusy}
          >
            New Worktree
          </button>
          <button
            className="button secondary"
            onClick={handlePruneWorktrees}
            disabled={!repo || worktreeBusy}
          >
            Prune
          </button>
          <button
            className="button secondary"
            onClick={handleRemoveWorktree}
            disabled={!repo || worktreeBusy}
          >
            Remove
          </button>
          {(branchBusy || worktreeBusy) && <span className="muted">Working…</span>}
        </div>
      </div>

      <div className="ide-content">
        {repo ? (
          <div
            className={`status-layout ${changelistNavCollapsed ? "collapsed" : ""}`}
          >
            <aside
              className={`changelist-panel ${changelistNavCollapsed ? "collapsed" : ""}`}
            >
              <div className="changelist-header">
                <div className="changelist-title">
                  <button
                    className={`panel-toggle ${changelistNavCollapsed ? "" : "open"}`}
                    onClick={() => setChangelistNavCollapsed((prev) => !prev)}
                    aria-label={
                      changelistNavCollapsed ? "Expand changelist panel" : "Collapse changelist panel"
                    }
                  >
                    ▶
                  </button>
                  <h3>Changelists</h3>
                </div>
                {!changelistNavCollapsed && (
                  <div className="changelist-header-actions">
                    <button className="chip" onClick={handleRefresh} disabled={!repo}>
                      Refresh
                    </button>
                    <button className="chip" onClick={handleCreateChangelist}>
                      New
                    </button>
                  </div>
                )}
              </div>
              {!changelistNavCollapsed && (
                <div className="changelist-body">
                  <div className="changelist-scroll">
                    <ul className="changelist-list">
                <li className="changelist-item changelist-item--staged">
                  <div className="changelist-row">
                    <div className="changelist-row-main">
                      <button
                        className={`collapse-toggle ${
                          collapsedChangelists.has(STAGED_LIST_ID) ? "" : "open"
                        }`}
                        onClick={() => toggleChangelistCollapse(STAGED_LIST_ID)}
                        aria-label={
                          collapsedChangelists.has(STAGED_LIST_ID)
                            ? "Expand staged list"
                            : "Collapse staged list"
                        }
                        aria-expanded={!collapsedChangelists.has(STAGED_LIST_ID)}
                      >
                        ▶
                      </button>
                      <button
                        type="button"
                        className="changelist-link staged"
                        onClick={() => toggleChangelistCollapse(STAGED_LIST_ID)}
                      >
                        Staged
                        <span className="count-pill">{stagedFiles.length}</span>
                      </button>
                    </div>
                    <div className="changelist-row-actions">
                    <button
                      className="button tiny"
                      onClick={() => {
                        if (commitPreview) {
                          setCommitSelection(
                            new Set(commitPreview.files.map((file) => file.path))
                          );
                        }
                        setCommitDialogOpen(true);
                        setCommitError(null);
                      }}
                      disabled={
                        commitBusy ||
                        commitLoading ||
                        (commitPreview?.files.length ?? 0) === 0 ||
                        (commitPreview?.invalid_hunks.length ?? 0) > 0
                      }
                    >
                      {commitBusy ? "Committing…" : "Commit"}
                    </button>
                    </div>
                  </div>
                  {!collapsedChangelists.has(STAGED_LIST_ID) && (
                    <ul className="changelist-files">
                      {stagedFiles.length === 0 ? (
                        <li className="changelist-file empty">No files</li>
                      ) : (
                        stagedFiles.map((file) => {
                          const { name, dir } = splitPath(file.path);
                          const icon = getFileIconInfo(file.path);
                          return (
                            <li
                              key={`staged-${file.path}`}
                              className={`changelist-file ${
                                selectedFile?.path === file.path ? "active" : ""
                              }`}
                            >
                              <div className="changelist-file-row">
                                <button
                                  className="changelist-file-link"
                                  title={file.path}
                                  onClick={() => handleSelectFile(file, "staged")}
                                >
                                  <img
                                    className={`file-icon ${icon.className}`}
                                    src={icon.url}
                                    alt=""
                                    aria-hidden="true"
                                    loading="lazy"
                                  />
                                  <span className="file-name">{name}</span>
                                  {dir && <span className="file-dir">{dir}</span>}
                                </button>
                                <button
                                  className="file-action file-action--unstage"
                                  onClick={() => handleUnstageFile(file)}
                                  disabled={fileActionBusy === file.path}
                                  aria-label={`Unstage ${file.path}`}
                                >
                                  −
                                </button>
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </li>
                {changelistItems.map((list) => {
                  const isActive = list.id === activeChangelistId;
                  const listFiles = (filesByChangelist.get(list.id) ?? []).filter((file) =>
                    isUnstagedStatus(file.status)
                  );
                  const count = unstagedCounts.get(list.id) ?? 0;
                  const isCollapsed = collapsedChangelists.has(list.id);
                  return (
                    <li key={list.id} className="changelist-item">
                      <div className="changelist-row">
                        <div className="changelist-row-main">
                          <button
                            className={`collapse-toggle ${isCollapsed ? "" : "open"}`}
                            onClick={() => toggleChangelistCollapse(list.id)}
                            aria-label={
                              isCollapsed ? "Expand changelist" : "Collapse changelist"
                            }
                            aria-expanded={!isCollapsed}
                          >
                            ▶
                          </button>
                          <button
                            type="button"
                            className={`changelist-link ${
                              selectedChangelistId === list.id ? "active" : ""
                            }`}
                            onClick={() => {
                              setSelectedChangelistId(list.id);
                              toggleChangelistCollapse(list.id);
                            }}
                          >
                            {list.name}
                            <span className="count-pill">{count}</span>
                          </button>
                        </div>
                        <div className="changelist-row-actions">
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
                        </div>
                      </div>
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
                      {!isCollapsed && (
                        <ul className="changelist-files">
                          {listFiles.length === 0 ? (
                            <li className="changelist-file empty">No files</li>
                          ) : (
                            listFiles.map((file) => {
                              const { name, dir } = splitPath(file.path);
                              const icon = getFileIconInfo(file.path);
                              return (
                                <li
                                  key={`${list.id}-${file.path}`}
                                  className={`changelist-file ${
                                    selectedFile?.path === file.path ? "active" : ""
                                  }`}
                                >
                                  <div className="changelist-file-row">
                                    <button
                                      className="changelist-file-link"
                                      title={file.path}
                                      onClick={() => {
                                        setSelectedChangelistId(list.id);
                                        handleSelectFile(file, "unstaged");
                                      }}
                                    >
                                      <img
                                        className={`file-icon ${icon.className}`}
                                        src={icon.url}
                                        alt=""
                                        aria-hidden="true"
                                        loading="lazy"
                                      />
                                      <span className="file-name">{name}</span>
                                      {dir && <span className="file-dir">{dir}</span>}
                                    </button>
                                    <button
                                      className="file-action file-action--stage"
                                      onClick={() => handleStageFile(file)}
                                      disabled={fileActionBusy === file.path}
                                      aria-label={`Stage ${file.path}`}
                                    >
                                      +
                                    </button>
                                  </div>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      )}
                    </li>
                  );
                })}
                    </ul>
                  </div>
                </div>
              )}
            </aside>

            <div className="file-panel">
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
                {diffHunkError && <div className="commit-error">{diffHunkError}</div>}
                {selectedFile && (
                  <div className="hunk-toolbar">
                    <label className="commit-checkbox">
                      <input
                        type="checkbox"
                        checked={hunkSelectionEnabled}
                        onChange={(event) => setHunkSelectionEnabled(event.target.checked)}
                      />
                      Enable hunk selection
                    </label>
                    <button
                      className="chip"
                      onClick={handleAssignHunks}
                      disabled={!hunkSelectionEnabled || hunkBusy || selectedHunkIds.size === 0}
                    >
                      Assign hunks
                    </button>
                    <button
                      className="chip"
                      onClick={handleUnassignHunks}
                      disabled={
                        !hunkSelectionEnabled ||
                        hunkBusy ||
                        !activeHunkAssignment ||
                        activeHunkAssignment.changelist_id !== selectedChangelistId
                      }
                    >
                      Clear hunks
                    </button>
                    {activeHunkAssignment &&
                      activeHunkAssignment.changelist_id !== selectedChangelistId && (
                        <span className="muted">Hunks assigned to another changelist.</span>
                      )}
                    {invalidAssignedHunks.length > 0 && (
                      <span className="muted">Some hunks need reselect.</span>
                    )}
                  </div>
                )}
                <div className="diff-view">
                  {diffLoading && <div className="muted">Loading diff...</div>}
                  {!diffLoading && diffParseError && (
                    <div className="muted">{diffParseError}</div>
                  )}
                  {!diffLoading && !diffParseError && parsedDiff.length === 0 && (
                    <div className="muted">No diff to display.</div>
                  )}
                  {parsedDiff.map((file) => (
                    <Diff
                      key={file.oldPath}
                      viewType="split"
                      diffType={file.type}
                      hunks={file.hunks}
                    >
                      {(hunks) =>
                        hunks.map((hunk) => {
                          const hunkId = hunkIdByHeader.get(hunk.content.trim());
                          return (
                            <div key={hunk.content} className="diff-hunk-row">
                              {hunkSelectionEnabled && hunkId && (
                                <label className="hunk-toggle">
                                  <input
                                    type="checkbox"
                                    checked={selectedHunkIds.has(hunkId)}
                                    onChange={() => toggleHunk(hunkId)}
                                  />
                                </label>
                              )}
                              <Hunk hunk={hunk} />
                            </div>
                          );
                        })
                      }
                    </Diff>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <h2>Open a repository</h2>
            <p className="muted">Select a repository to get started.</p>
            <button className="button" onClick={handlePick}>
              Open Repo
            </button>
            {recent.length > 0 && (
              <div className="empty-recent">
                <strong>Recent repositories</strong>
                <ul className="recent-list">
                  {recent.map((item) => (
                    <li key={item.repo_id}>
                      <button
                        className="recent-item"
                        onClick={() => handleSelectRecent(item.path)}
                      >
                        <span className="recent-name">{item.name}</span>
                        <span className="recent-path">{item.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <div className="ide-statusbar">
        <div className="status-left">
          <div className="status-select">
            <span className="status-label">Worktree</span>
            <Select
              value={repo?.worktree_path ?? ""}
              onValueChange={handleSelectWorktree}
              disabled={!repo || worktreeBusy || worktrees.length === 0}
            >
              <SelectTrigger className="select-trigger tiny">
                <SelectValue className="select-value" placeholder="Worktree" />
              </SelectTrigger>
              <SelectContent>
                {worktrees.length === 0 && (
                  <SelectItem value={repo?.worktree_path ?? "none"} disabled>
                    {repo?.worktree_path ?? "No worktrees"}
                  </SelectItem>
                )}
                {worktrees.map((wt) => (
                  <SelectItem key={wt.path} value={wt.path}>
                    {wt.path} ({wt.branch})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="status-select">
            <span className="status-label">Branch</span>
            <Select
              value={branchValue}
              disabled={!branches || branchBusy}
              onValueChange={(value) => {
                if (!value) return;
                const [type, name] = value.split("::");
                if (type && name) {
                  handleCheckout(type as "local" | "remote", name);
                }
              }}
            >
              <SelectTrigger className="select-trigger tiny">
                <SelectValue
                  className="select-value"
                  placeholder={branches ? branches.current : "No branches"}
                />
              </SelectTrigger>
              <SelectContent>
                {branches?.locals.map((name) => (
                  <SelectItem key={`local-${name}`} value={`local::${name}`}>
                    {name}
                  </SelectItem>
                ))}
                {branches?.remotes.map((name) => (
                  <SelectItem key={`remote-${name}`} value={`remote::${name}`}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="status-pill">Watching {polling ? "on" : "off"}</span>
          <span className="status-pill">Head {status?.head.oid_short ?? "—"}</span>
        </div>
        <div className="status-right">
          <span className="status-pill">Staged {status?.counts.staged ?? 0}</span>
          <span className="status-pill">Unstaged {status?.counts.unstaged ?? 0}</span>
          <span className="status-pill">Untracked {status?.counts.untracked ?? 0}</span>
          <span className="status-pill">Conflicts {status?.counts.conflicted ?? 0}</span>
        </div>
    </div>
  </div>
  );
}
