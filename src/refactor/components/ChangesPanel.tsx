import { useMemo, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Undo2,
  Minus,
  Plus,
  SplitSquareHorizontal,
  AlignJustify
} from "lucide-react";
import { getIconForFilePath, getIconUrlForFilePath } from "vscode-material-icons";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";
import type { ChangelistState, RepoDiffKind, RepoStatus, StatusFile } from "../../types/ipc";

interface ChangesPanelProps {
  status?: RepoStatus;
  changelists: ChangelistState | null;
  selectedChangelistId: string;
  onSelectedChangelistChange: (id: string) => void;
  onCreateChangelist: (name: string) => Promise<void>;
  onRenameChangelist: (id: string, name: string) => Promise<void>;
  onDeleteChangelist: (id: string) => Promise<void>;
  onSetActiveChangelist: (id: string) => Promise<void>;
  onStageFile: (file: StatusFile) => Promise<void>;
  onUnstageFile: (file: StatusFile) => Promise<void>;
  onStageAllInChangelist: (id: string) => Promise<void>;
  onAddAllUnversioned: () => Promise<void>;
  onMovePathsToChangelist: (paths: string[], targetId: string) => Promise<void>;
  onUnstageFilesToChangelist: (paths: string[], targetId: string) => Promise<void>;
  onDeleteUnversionedFile: (path: string) => Promise<void>;
  fileActionBusyPath: string | null;
  onFileSelect: (file: StatusFile, kind: "staged" | "unstaged") => void;
  selectedFile: StatusFile | null;
  selectedDiffKind: RepoDiffKind;
  viewMode: "unified" | "sideBySide";
  onViewModeChange: (mode: "unified" | "sideBySide") => void;
  showHunks: boolean;
  onShowHunksChange: (show: boolean) => void;
}

const STAGED_LIST_ID = "staged";
const UNVERSIONED_LIST_ID = "unversioned-files";
const UNVERSIONED_LIST_NAME = "Unversioned files";
const EMPTY_FILES: StatusFile[] = [];
const ICONS_URL = "/material-icons";

const isStagedStatus = (status: StatusFile["status"]) =>
  status === "staged" || status === "both";

const isStageableTrackedStatus = (status: StatusFile["status"]) =>
  status === "unstaged" || status === "both";

const isTrackedUnstagedStatus = (status: StatusFile["status"]) =>
  status === "unstaged" || status === "both" || status === "conflicted";

const isUnversionedStatus = (status: StatusFile["status"]) => status === "untracked";

const getStatusTextColor = (status: StatusFile["status"]) => {
  if (status === "untracked") return "text-[#d7ba7d]"; // unversioned
  if (status === "conflicted") return "text-[#c75450]"; // deleted/conflict fallback
  return "text-[#6897bb]"; // changed
};

const getFileIconInfo = (path: string) => {
  const iconName = getIconForFilePath(path);
  return {
    className: `ext-${iconName}`,
    url: getIconUrlForFilePath(path, ICONS_URL)
  };
};

const splitPath = (path: string) => {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const name = parts.pop() ?? normalized;
  const dir = parts.join("/");
  return { name, dir };
};

type ContextMenuTarget =
  | { kind: "regular-list"; listId: string }
  | { kind: "regular-file"; listId: string; path: string }
  | { kind: "staged-list" }
  | { kind: "staged-file"; path: string }
  | { kind: "unversioned-list" }
  | { kind: "unversioned-file"; path: string };

type ConfirmAction =
  | { kind: "stage-all"; listId: string; listName: string; count: number }
  | { kind: "add-all"; count: number }
  | {
      kind: "move";
      paths: string[];
      targetId: string;
      targetName: string;
      sourceLabel: string;
    }
  | { kind: "unstage-to-list"; paths: string[]; targetId: string; targetName: string; count: number }
  | { kind: "delete-unversioned-file"; path: string };

export function ChangesPanel({
  status,
  changelists,
  selectedChangelistId,
  onSelectedChangelistChange,
  onCreateChangelist,
  onRenameChangelist,
  onDeleteChangelist,
  onSetActiveChangelist,
  onStageFile,
  onUnstageFile,
  onStageAllInChangelist,
  onAddAllUnversioned,
  onMovePathsToChangelist,
  onUnstageFilesToChangelist,
  onDeleteUnversionedFile,
  fileActionBusyPath,
  onFileSelect,
  selectedFile,
  selectedDiffKind,
  viewMode,
  onViewModeChange,
  showHunks,
  onShowHunksChange
}: ChangesPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [panelBusy, setPanelBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    target: ContextMenuTarget | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    target: null
  });

  const files = status?.files ?? EMPTY_FILES;
  const stagedFiles = useMemo(
    () => files.filter((file) => isStagedStatus(file.status)),
    [files]
  );
  const unversionedFiles = useMemo(
    () => files.filter((file) => isUnversionedStatus(file.status)),
    [files]
  );

  const filesByChangelist = useMemo(() => {
    const map = new Map<string, StatusFile[]>();
    for (const file of files) {
      if (!isTrackedUnstagedStatus(file.status)) continue;
      const key = file.changelist_id ?? "default";
      const list = map.get(key);
      if (list) {
        list.push(file);
      } else {
        map.set(key, [file]);
      }
    }
    return map;
  }, [files]);

  const unstagedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const file of files) {
      if (!isTrackedUnstagedStatus(file.status)) continue;
      const key = file.changelist_id ?? "default";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [files]);

  const changelistItems = useMemo(() => changelists?.lists ?? [], [changelists?.lists]);
  const listById = useMemo(
    () => new Map(changelistItems.map((item) => [item.id, item])),
    [changelistItems]
  );
  const activeChangelistId = changelists?.active_id ?? "default";
  const activeChangelistName =
    changelistItems.find((item) => item.id === activeChangelistId)?.name ?? "Default";
  const hasMultipleChangelists = changelistItems.length > 1;
  const contextTarget = contextMenu.target;
  const contextRegularList =
    contextTarget?.kind === "regular-list" ? listById.get(contextTarget.listId) ?? null : null;
  const contextRegularFile =
    contextTarget?.kind === "regular-file"
      ? (filesByChangelist.get(contextTarget.listId) ?? []).find(
          (file) => file.path === contextTarget.path
        ) ?? null
      : null;
  const contextStagedFile =
    contextTarget?.kind === "staged-file"
      ? stagedFiles.find((file) => file.path === contextTarget.path) ?? null
      : null;
  const contextUnversionedFile =
    contextTarget?.kind === "unversioned-file"
      ? unversionedFiles.find((file) => file.path === contextTarget.path) ?? null
      : null;
  const contextMoveTargetsForRegularList = contextRegularList
    ? changelistItems.filter((item) => item.id !== contextRegularList.id)
    : [];
  const contextMoveTargetsForRegularFile =
    contextRegularFile && contextTarget?.kind === "regular-file"
      ? changelistItems.filter((item) => item.id !== contextTarget.listId)
      : [];
  const contextUnstageTargets = changelistItems;
  const deleteMoveTargetName =
    deleteTarget?.id === activeChangelistId ? "Default" : activeChangelistName;
  const contextRegularListFiles = contextRegularList
    ? filesByChangelist.get(contextRegularList.id) ?? EMPTY_FILES
    : EMPTY_FILES;
  const contextRegularListStageablePaths = contextRegularListFiles
    .filter((file) => isStageableTrackedStatus(file.status))
    .map((file) => file.path);
  const contextRegularListAllPaths = contextRegularListFiles.map((file) => file.path);
  const contextStagedPaths = stagedFiles.map((file) => file.path);
  const contextUnversionedPaths = unversionedFiles.map((file) => file.path);

  const toggleSection = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirmCreate = async () => {
    const name = createName.trim();
    if (!name) {
      setCreateError("Changelist name is required.");
      return;
    }
    try {
      setPanelBusy(true);
      await onCreateChangelist(name);
      setCreateOpen(false);
      setCreateName("");
      setCreateError(null);
    } catch (error) {
      console.error("changelist create failed", error);
      setCreateError("Create changelist failed.");
    } finally {
      setPanelBusy(false);
    }
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name) {
      setRenameError("Changelist name is required.");
      return;
    }
    if (name === renameTarget.name) {
      setRenameError("Name is unchanged.");
      return;
    }
    try {
      setPanelBusy(true);
      await onRenameChangelist(renameTarget.id, name);
      setRenameTarget(null);
      setRenameName("");
      setRenameError(null);
    } catch (error) {
      console.error("changelist rename failed", error);
      setRenameError("Rename changelist failed.");
    } finally {
      setPanelBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      setPanelBusy(true);
      await onDeleteChangelist(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      console.error("changelist delete failed", error);
    } finally {
      setPanelBusy(false);
    }
  };

  const openCreateDialog = () => {
    setCreateName("");
    setCreateError(null);
    setCreateOpen(true);
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, open: false, target: null }));
  };

  const openContextMenu = (
    event: {
      preventDefault: () => void;
      stopPropagation?: () => void;
      clientX: number;
      clientY: number;
    },
    target: ContextMenuTarget
  ) => {
    event.preventDefault();
    if (event.stopPropagation) event.stopPropagation();
    setContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      target
    });
  };

  const openConfirmDialog = (action: ConfirmAction) => {
    setConfirmError(null);
    setConfirmAction(action);
    closeContextMenu();
  };

  const handleContextSetActiveChangelist = async () => {
    if (!contextRegularList || contextRegularList.id === activeChangelistId) return;
    try {
      setPanelBusy(true);
      await onSetActiveChangelist(contextRegularList.id);
    } catch (error) {
      console.error("context set active failed", error);
    } finally {
      setPanelBusy(false);
      closeContextMenu();
    }
  };

  const handleContextDeleteChangelist = () => {
    if (!contextRegularList || contextRegularList.id === "default") return;
    setDeleteTarget({ id: contextRegularList.id, name: contextRegularList.name });
    closeContextMenu();
  };

  const handleContextRenameChangelist = () => {
    if (!contextRegularList || contextRegularList.id === "default") return;
    setRenameTarget({ id: contextRegularList.id, name: contextRegularList.name });
    setRenameName(contextRegularList.name);
    setRenameError(null);
    closeContextMenu();
  };

  const handleContextStageFile = async (file: StatusFile) => {
    try {
      setPanelBusy(true);
      await onStageFile(file);
    } catch (error) {
      console.error("context stage file failed", error);
    } finally {
      setPanelBusy(false);
      closeContextMenu();
    }
  };

  const confirmOperationCopy = useMemo(() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === "stage-all") {
      return {
        title: "Stage all files",
        description: `Stage ${confirmAction.count} file${
          confirmAction.count === 1 ? "" : "s"
        } in "${confirmAction.listName}"?`,
        confirmLabel: "Stage all",
        destructive: false
      };
    }
    if (confirmAction.kind === "add-all") {
      return {
        title: "Add all unversioned files",
        description: `Add ${confirmAction.count} unversioned file${
          confirmAction.count === 1 ? "" : "s"
        } to the active changelist?`,
        confirmLabel: "Add all",
        destructive: false
      };
    }
    if (confirmAction.kind === "move") {
      return {
        title: "Move to changelist",
        description: `Move ${confirmAction.paths.length} file${
          confirmAction.paths.length === 1 ? "" : "s"
        } from "${confirmAction.sourceLabel}" to "${confirmAction.targetName}"?`,
        confirmLabel: "Move",
        destructive: false
      };
    }
    if (confirmAction.kind === "unstage-to-list") {
      return {
        title: "Unstage to changelist",
        description: `Unstage ${confirmAction.count} file${
          confirmAction.count === 1 ? "" : "s"
        } into "${confirmAction.targetName}"?`,
        confirmLabel: "Unstage",
        destructive: false
      };
    }
    return {
      title: "Delete unversioned file",
      description: `Delete "${confirmAction.path}" from disk? This cannot be undone.`,
      confirmLabel: "Delete file",
      destructive: true
    };
  }, [confirmAction]);

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    try {
      setPanelBusy(true);
      setConfirmError(null);
      switch (confirmAction.kind) {
        case "stage-all":
          await onStageAllInChangelist(confirmAction.listId);
          break;
        case "add-all":
          await onAddAllUnversioned();
          break;
        case "move":
          await onMovePathsToChangelist(confirmAction.paths, confirmAction.targetId);
          break;
        case "unstage-to-list":
          await onUnstageFilesToChangelist(confirmAction.paths, confirmAction.targetId);
          break;
        case "delete-unversioned-file":
          await onDeleteUnversionedFile(confirmAction.path);
          break;
        default:
          break;
      }
      setConfirmAction(null);
      setConfirmError(null);
    } catch (error) {
      console.error("confirm action failed", error);
      setConfirmError((error as Error)?.message ?? "Operation failed.");
    } finally {
      setPanelBusy(false);
    }
  };

  return (
    <div className="w-80 shrink-0 min-h-0 border-r border-[#323232] bg-[#3c3f41] flex flex-col">
      <div className="px-4 py-3 border-b border-[#323232]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-[#bbbbbb]">Source Control</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5 text-xs hover:bg-[#4e5254] text-[#afb1b3]"
            onClick={openCreateDialog}
          >
            <Plus className="size-3.5" />
            <span>Add Changelist</span>
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 gap-1.5 text-xs hover:bg-[#4e5254] ${
                viewMode === "unified" ? "bg-[#4e5254] text-[#bbbbbb]" : "text-[#afb1b3]"
              }`}
              onClick={() => onViewModeChange("unified")}
            >
              <AlignJustify className="size-3.5" />
              <span>Unified</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 px-2 gap-1.5 text-xs hover:bg-[#4e5254] ${
                viewMode === "sideBySide" ? "bg-[#4e5254] text-[#bbbbbb]" : "text-[#afb1b3]"
              }`}
              onClick={() => onViewModeChange("sideBySide")}
            >
              <SplitSquareHorizontal className="size-3.5" />
              <span>Side by Side</span>
            </Button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="show-hunks" className="text-xs text-[#afb1b3] cursor-pointer">
              Show Hunks
            </Label>
            <Switch
              id="show-hunks"
              checked={showHunks}
              onCheckedChange={onShowHunksChange}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="p-2">
          <div className="mb-2">
            <button
              onClick={() => toggleSection(STAGED_LIST_ID)}
              className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#4e5254] rounded text-left"
              onContextMenu={(event) => {
                openContextMenu(event, { kind: "staged-list" });
              }}
              data-testid={`changelist-row:${STAGED_LIST_ID}`}
            >
              {collapsed.has(STAGED_LIST_ID) ? (
                <ChevronRight className="size-4 text-[#afb1b3]" />
              ) : (
                <ChevronDown className="size-4 text-[#afb1b3]" />
              )}
              <span className="text-sm text-[#bbbbbb]">Staged ({stagedFiles.length})</span>
            </button>
            {!collapsed.has(STAGED_LIST_ID) && (
              <div className="mt-1 ml-2">
                {stagedFiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-[#787878]">No files</div>
                ) : (
                  stagedFiles.map((file) => {
                    const icon = getFileIconInfo(file.path);
                    const { name, dir } = splitPath(file.path);
                    const isSelected =
                      selectedFile?.path === file.path && selectedDiffKind === "staged";
                    return (
                      <div
                        key={`staged-${file.path}`}
                        className="grid grid-cols-[minmax(0,1fr)_20px_20px] items-center gap-1 w-full min-w-0"
                      >
                        <button
                          onClick={() => onFileSelect(file, "staged")}
                          onContextMenu={(event) => {
                            openContextMenu(event, { kind: "staged-file", path: file.path });
                          }}
                          data-active={isSelected ? "true" : "false"}
                          data-testid={`file-row-staged:${file.path}`}
                          className={`flex items-center gap-2 min-w-0 overflow-hidden px-2 py-1.5 rounded text-left hover:bg-[#4e5254] ${
                            isSelected ? "bg-[#4e5254]" : ""
                          }`}
                          title={file.path}
                        >
                          <img
                            className={`size-3.5 shrink-0 ${icon.className}`}
                            src={icon.url}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                          />
                          <span
                            className={`text-xs truncate max-w-28 shrink ${getStatusTextColor(file.status)}`}
                          >
                            {name}
                          </span>
                          {dir && (
                            <span
                              className="text-xs text-[#787878] truncate flex-1 min-w-0"
                              title={file.path}
                            >
                              {dir}
                            </span>
                          )}
                        </button>
                        <button
                          className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-40"
                          title="Revert (coming soon)"
                          disabled
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Undo2 className="size-3" />
                        </button>
                        <button
                          className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-50"
                          onClick={() => onUnstageFile(file)}
                          disabled={fileActionBusyPath === file.path}
                          title="Unstage file"
                          data-testid={`file-action-unstage:${file.path}`}
                        >
                          <Minus className="size-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {changelistItems.map((list) => {
            const isActive = list.id === activeChangelistId;
            const isCollapsed = collapsed.has(list.id);
            const listFiles = filesByChangelist.get(list.id) ?? [];
            const count = unstagedCounts.get(list.id) ?? 0;

            return (
              <div key={list.id} className="mb-2">
                <div
                  className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#4e5254] rounded"
                  data-testid={`changelist-row:${list.id}`}
                  onContextMenu={(event) => {
                    openContextMenu(event, { kind: "regular-list", listId: list.id });
                  }}
                >
                  <button onClick={() => toggleSection(list.id)}>
                    {isCollapsed ? (
                      <ChevronRight className="size-4 text-[#afb1b3]" />
                    ) : (
                      <ChevronDown className="size-4 text-[#afb1b3]" />
                    )}
                  </button>
                  <button
                    className={`text-sm flex-1 text-left ${
                      selectedChangelistId === list.id ? "text-[#bbbbbb]" : "text-[#9b9b9b]"
                    }`}
                    onClick={() => onSelectedChangelistChange(list.id)}
                  >
                    {list.name} ({count})
                  </button>
                  {isActive ? (
                    <span className="text-[10px] text-[#629755]">Active</span>
                  ) : (
                    <button
                      className="text-[10px] text-[#787878] hover:bg-[#4e5254] rounded px-1"
                      onClick={() => onSetActiveChangelist(list.id)}
                      disabled={panelBusy}
                    >
                      Set Active
                    </button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="mt-1 ml-2">
                    {listFiles.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-[#787878]">No files</div>
                    ) : (
                      listFiles.map((file) => {
                        const icon = getFileIconInfo(file.path);
                        const { name, dir } = splitPath(file.path);
                        const isSelected =
                          selectedFile?.path === file.path && selectedDiffKind === "unstaged";
                        return (
                          <div
                            key={`${list.id}-${file.path}`}
                            className="grid grid-cols-[minmax(0,1fr)_20px_20px] items-center gap-1 w-full min-w-0"
                          >
                            <button
                              onClick={() => {
                                onSelectedChangelistChange(list.id);
                                onFileSelect(file, "unstaged");
                              }}
                              onContextMenu={(event) => {
                                openContextMenu(event, {
                                  kind: "regular-file",
                                  listId: list.id,
                                  path: file.path
                                });
                              }}
                              data-active={isSelected ? "true" : "false"}
                              data-testid={`file-row-unstaged:${list.id}:${file.path}`}
                              className={`flex items-center gap-2 min-w-0 overflow-hidden px-2 py-1.5 rounded text-left hover:bg-[#4e5254] ${
                                isSelected ? "bg-[#4e5254]" : ""
                              }`}
                              title={file.path}
                            >
                              <img
                                className={`size-3.5 shrink-0 ${icon.className}`}
                                src={icon.url}
                                alt=""
                                aria-hidden="true"
                                loading="lazy"
                              />
                              <span
                                className={`text-xs truncate max-w-28 shrink ${getStatusTextColor(file.status)}`}
                              >
                                {name}
                              </span>
                              {dir && (
                                <span
                                  className="text-xs text-[#787878] truncate flex-1 min-w-0"
                                  title={file.path}
                                >
                                  {dir}
                                </span>
                              )}
                            </button>
                            <button
                              className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-40"
                              title="Revert (coming soon)"
                              disabled
                              onClick={(event) => event.stopPropagation()}
                            >
                              <Undo2 className="size-3" />
                            </button>
                            <button
                              className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-50"
                              onClick={() => onStageFile(file)}
                              disabled={fileActionBusyPath === file.path}
                              title="Stage file"
                            >
                              <Plus className="size-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}

          <div className="mb-2">
            <div
              className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#4e5254] rounded text-left"
              data-testid={`changelist-row:${UNVERSIONED_LIST_ID}`}
              onContextMenu={(event) => {
                openContextMenu(event, { kind: "unversioned-list" });
              }}
            >
              <button onClick={() => toggleSection(UNVERSIONED_LIST_ID)}>
                {collapsed.has(UNVERSIONED_LIST_ID) ? (
                  <ChevronRight className="size-4 text-[#afb1b3]" />
                ) : (
                  <ChevronDown className="size-4 text-[#afb1b3]" />
                )}
              </button>
              <button
                className={`text-sm flex-1 text-left ${
                  selectedChangelistId === UNVERSIONED_LIST_ID
                    ? "text-[#bbbbbb]"
                    : "text-[#9b9b9b]"
                }`}
                onClick={() => onSelectedChangelistChange(UNVERSIONED_LIST_ID)}
              >
                {UNVERSIONED_LIST_NAME} ({unversionedFiles.length})
              </button>
            </div>
            {!collapsed.has(UNVERSIONED_LIST_ID) && (
              <div className="mt-1 ml-2">
                {unversionedFiles.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-[#787878]">No files</div>
                ) : (
                  unversionedFiles.map((file) => {
                    const icon = getFileIconInfo(file.path);
                    const { name, dir } = splitPath(file.path);
                    const isSelected =
                      selectedFile?.path === file.path && selectedDiffKind === "unstaged";
                    return (
                      <div
                        key={`unversioned-${file.path}`}
                        className="grid grid-cols-[minmax(0,1fr)_20px_20px] items-center gap-1 w-full min-w-0"
                      >
                        <button
                          onClick={() => {
                            onSelectedChangelistChange(UNVERSIONED_LIST_ID);
                            onFileSelect(file, "unstaged");
                          }}
                          onContextMenu={(event) => {
                            openContextMenu(event, {
                              kind: "unversioned-file",
                              path: file.path
                            });
                          }}
                          data-active={isSelected ? "true" : "false"}
                          data-testid={`file-row-unstaged:${UNVERSIONED_LIST_ID}:${file.path}`}
                          className={`flex items-center gap-2 min-w-0 overflow-hidden px-2 py-1.5 rounded text-left hover:bg-[#4e5254] ${
                            isSelected ? "bg-[#4e5254]" : ""
                          }`}
                          title={file.path}
                        >
                          <img
                            className={`size-3.5 shrink-0 ${icon.className}`}
                            src={icon.url}
                            alt=""
                            aria-hidden="true"
                            loading="lazy"
                          />
                          <span
                            className={`text-xs truncate max-w-28 shrink ${getStatusTextColor(file.status)}`}
                          >
                            {name}
                          </span>
                          {dir && (
                            <span
                              className="text-xs text-[#787878] truncate flex-1 min-w-0"
                              title={file.path}
                            >
                              {dir}
                            </span>
                          )}
                        </button>
                        <button
                          className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-40"
                          title="Revert (coming soon)"
                          disabled
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Undo2 className="size-3" />
                        </button>
                        <button
                          className="h-5 w-5 shrink-0 flex items-center justify-center text-[#afb1b3] hover:bg-[#4e5254] rounded disabled:opacity-50"
                          onClick={() => onStageFile(file)}
                          disabled={fileActionBusyPath === file.path}
                          title="Stage file"
                          data-testid={`file-action-stage:${UNVERSIONED_LIST_ID}:${file.path}`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <DropdownMenu
        open={contextMenu.open}
        onOpenChange={(open) => {
          if (!open) {
            closeContextMenu();
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed h-0 w-0 opacity-0 pointer-events-none"
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          className="w-56 bg-[#3c3f41] border-[#323232] text-[#bbbbbb] z-50"
        >
          {contextTarget?.kind === "regular-list" &&
            contextRegularList &&
            contextRegularList.id !== activeChangelistId && (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  void handleContextSetActiveChangelist();
                }}
                disabled={panelBusy}
                className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
              >
                Set active
              </DropdownMenuItem>
            )}

          {contextTarget?.kind === "regular-list" && contextRegularList && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openConfirmDialog({
                  kind: "stage-all",
                  listId: contextRegularList.id,
                  listName: contextRegularList.name,
                  count: contextRegularListStageablePaths.length
                });
              }}
              disabled={panelBusy || contextRegularListStageablePaths.length === 0}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Stage all
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "regular-list" &&
            contextRegularList &&
            hasMultipleChangelists &&
            contextMoveTargetsForRegularList.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]">
                  Move to changelist
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
                  {contextMoveTargetsForRegularList.map((target) => (
                    <DropdownMenuItem
                      key={`move-list-${contextRegularList.id}-${target.id}`}
                      onSelect={(event) => {
                        event.preventDefault();
                        openConfirmDialog({
                          kind: "move",
                          paths: contextRegularListAllPaths,
                          targetId: target.id,
                          targetName: target.name,
                          sourceLabel: contextRegularList.name
                        });
                      }}
                      disabled={panelBusy || contextRegularListAllPaths.length === 0}
                      className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                    >
                      {target.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

          {contextTarget?.kind === "regular-file" &&
            contextRegularFile &&
            hasMultipleChangelists &&
            contextMoveTargetsForRegularFile.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]">
                  Move to changelist
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
                  {contextMoveTargetsForRegularFile.map((target) => (
                    <DropdownMenuItem
                      key={`move-file-${contextRegularFile.path}-${target.id}`}
                      onSelect={(event) => {
                        event.preventDefault();
                        openConfirmDialog({
                          kind: "move",
                          paths: [contextRegularFile.path],
                          targetId: target.id,
                          targetName: target.name,
                          sourceLabel: contextRegularFile.changelist_name ?? "Default"
                        });
                      }}
                      disabled={panelBusy}
                      className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                    >
                      {target.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

          {contextTarget?.kind === "regular-file" && contextRegularFile && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void handleContextStageFile(contextRegularFile);
              }}
              disabled={panelBusy || fileActionBusyPath === contextRegularFile.path}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Stage
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "staged-list" && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openConfirmDialog({
                  kind: "unstage-to-list",
                  paths: contextStagedPaths,
                  targetId: activeChangelistId,
                  targetName: activeChangelistName,
                  count: contextStagedPaths.length
                });
              }}
              disabled={panelBusy || contextStagedPaths.length === 0}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Unstage all
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "staged-file" && contextStagedFile && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openConfirmDialog({
                  kind: "unstage-to-list",
                  paths: [contextStagedFile.path],
                  targetId: activeChangelistId,
                  targetName: activeChangelistName,
                  count: 1
                });
              }}
              disabled={panelBusy || fileActionBusyPath === contextStagedFile.path}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Unstage
            </DropdownMenuItem>
          )}

          {(contextTarget?.kind === "staged-list" || contextTarget?.kind === "staged-file") &&
            hasMultipleChangelists &&
            contextUnstageTargets.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]">
                  Unstage to changelist
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
                  {contextUnstageTargets.map((target) => {
                    const paths =
                      contextTarget?.kind === "staged-file" && contextStagedFile
                        ? [contextStagedFile.path]
                        : contextStagedPaths;
                    return (
                      <DropdownMenuItem
                        key={`unstage-${target.id}`}
                        onSelect={(event) => {
                          event.preventDefault();
                          openConfirmDialog({
                            kind: "unstage-to-list",
                            paths,
                            targetId: target.id,
                            targetName: target.name,
                            count: paths.length
                          });
                        }}
                        disabled={panelBusy || paths.length === 0}
                        className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                      >
                        {target.name}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

          {contextTarget?.kind === "unversioned-list" && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openConfirmDialog({
                  kind: "add-all",
                  count: contextUnversionedPaths.length
                });
              }}
              disabled={panelBusy || contextUnversionedPaths.length === 0}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Add all
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "unversioned-list" && contextUnversionedPaths.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]">
                Delete file
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
                {contextUnversionedPaths.map((path) => (
                  <DropdownMenuItem
                    key={`delete-unversioned-${path}`}
                    onSelect={(event) => {
                      event.preventDefault();
                      openConfirmDialog({ kind: "delete-unversioned-file", path });
                    }}
                    disabled={panelBusy}
                    className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254] text-[#d6a19f]"
                  >
                    {path}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {contextTarget?.kind === "unversioned-file" && contextUnversionedFile && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void handleContextStageFile(contextUnversionedFile);
              }}
              disabled={panelBusy || fileActionBusyPath === contextUnversionedFile.path}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              Add file
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "unversioned-file" && contextUnversionedFile && (
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                openConfirmDialog({
                  kind: "delete-unversioned-file",
                  path: contextUnversionedFile.path
                });
              }}
              disabled={panelBusy}
              className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254] text-[#d6a19f]"
            >
              Delete file
            </DropdownMenuItem>
          )}

          {contextTarget?.kind === "regular-list" &&
            contextRegularList &&
            contextRegularList.id !== "default" && (
              <>
                <DropdownMenuSeparator className="bg-[#323232]" />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleContextRenameChangelist();
                  }}
                  className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                >
                  Rename changelist
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    handleContextDeleteChangelist();
                  }}
                  className="cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254] text-[#d6a19f]"
                >
                  Delete changelist
                </DropdownMenuItem>
              </>
            )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) {
            setCreateError(null);
          }
        }}
      >
        <DialogContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle>Create Changelist</DialogTitle>
            <DialogDescription className="text-[#787878]">
              Name the new changelist.
            </DialogDescription>
          </DialogHeader>
          <input
            className="w-full h-9 rounded-md border border-[#323232] bg-[#2f3133] px-3 text-sm outline-none"
            placeholder="UI polish"
            value={createName}
            onChange={(event) => {
              setCreateName(event.target.value);
              if (createError) setCreateError(null);
            }}
          />
          {createError && <div className="text-xs text-[#c75450]">{createError}</div>}
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-[#bbbbbb] hover:bg-[#4e5254]"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#4e5254] hover:bg-[#5a5f63] text-[#bbbbbb]"
              onClick={confirmCreate}
              disabled={panelBusy}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!renameTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRenameTarget(null);
            setRenameName("");
            setRenameError(null);
          }
        }}
      >
        <DialogContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle>Rename Changelist</DialogTitle>
            <DialogDescription className="text-[#787878]">
              Update changelist name.
            </DialogDescription>
          </DialogHeader>
          <input
            className="w-full h-9 rounded-md border border-[#323232] bg-[#2f3133] px-3 text-sm outline-none"
            value={renameName}
            onChange={(event) => {
              setRenameName(event.target.value);
              if (renameError) setRenameError(null);
            }}
          />
          {renameError && <div className="text-xs text-[#c75450]">{renameError}</div>}
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-[#bbbbbb] hover:bg-[#4e5254]"
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#4e5254] hover:bg-[#5a5f63] text-[#bbbbbb]"
              onClick={confirmRename}
              disabled={panelBusy}
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmAction}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmAction(null);
            setConfirmError(null);
          }
        }}
      >
        <DialogContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle>{confirmOperationCopy?.title ?? "Confirm action"}</DialogTitle>
            <DialogDescription className="text-[#787878]">
              {confirmOperationCopy?.description ?? "Proceed with this action?"}
            </DialogDescription>
          </DialogHeader>
          {confirmError && <div className="text-xs text-[#c75450]">{confirmError}</div>}
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-[#bbbbbb] hover:bg-[#4e5254]"
              onClick={() => setConfirmAction(null)}
              disabled={panelBusy}
            >
              Cancel
            </Button>
            <Button
              className={
                confirmOperationCopy?.destructive
                  ? "bg-[#6b3d3a] hover:bg-[#7b4542] text-[#f3d3d2]"
                  : "bg-[#4e5254] hover:bg-[#5a5f63] text-[#bbbbbb]"
              }
              onClick={executeConfirmAction}
              disabled={panelBusy}
            >
              {confirmOperationCopy?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle>Delete Changelist</DialogTitle>
            <DialogDescription className="text-[#787878]">
              Delete changelist "{deleteTarget?.name}"? This cannot be undone. Changes will be
              moved to "{deleteMoveTargetName}".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              className="text-[#bbbbbb] hover:bg-[#4e5254]"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              className="bg-[#6b3d3a] hover:bg-[#7b4542] text-[#f3d3d2]"
              onClick={confirmDelete}
              disabled={panelBusy}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
