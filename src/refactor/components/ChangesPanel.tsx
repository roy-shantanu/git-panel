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
import { ScrollArea } from "./ui/scroll-area";
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
import type { ChangelistState, RepoStatus, StatusFile } from "../../types/ipc";

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
  fileActionBusyPath: string | null;
  onFileSelect: (file: StatusFile, kind: "staged" | "unstaged") => void;
  selectedFile: StatusFile | null;
  viewMode: "unified" | "sideBySide";
  onViewModeChange: (mode: "unified" | "sideBySide") => void;
  showHunks: boolean;
  onShowHunksChange: (show: boolean) => void;
}

const STAGED_LIST_ID = "staged";
const EMPTY_FILES: StatusFile[] = [];
const ICONS_URL = "/material-icons";

const isStagedStatus = (status: StatusFile["status"]) =>
  status === "staged" || status === "both";

const isUnstagedStatus = (status: StatusFile["status"]) =>
  status === "unstaged" ||
  status === "untracked" ||
  status === "both" ||
  status === "conflicted";

const getStatusTextColor = (status: StatusFile["status"]) => {
  if (status === "untracked") return "text-[#629755]"; // added
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
  fileActionBusyPath,
  onFileSelect,
  selectedFile,
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
  const [panelBusy, setPanelBusy] = useState(false);

  const files = status?.files ?? EMPTY_FILES;
  const stagedFiles = useMemo(
    () => files.filter((file) => isStagedStatus(file.status)),
    [files]
  );

  const filesByChangelist = useMemo(() => {
    const map = new Map<string, StatusFile[]>();
    for (const file of files) {
      if (!isUnstagedStatus(file.status)) continue;
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
      if (!isUnstagedStatus(file.status)) continue;
      const key = file.changelist_id ?? "default";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [files]);

  const changelistItems = changelists?.lists ?? [];
  const activeChangelistId = changelists?.active_id ?? "default";

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

  return (
    <div className="w-80 shrink-0 border-r border-[#323232] bg-[#3c3f41] flex flex-col">
      <div className="px-4 py-3 border-b border-[#323232]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-[#bbbbbb]">Source Control</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5 text-xs hover:bg-[#4e5254] text-[#afb1b3]"
            onClick={() => {
              setCreateName("");
              setCreateError(null);
              setCreateOpen(true);
            }}
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

      <ScrollArea className="flex-1">
        <div className="p-2">
          <div className="mb-2">
            <button
              onClick={() => toggleSection(STAGED_LIST_ID)}
              className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#4e5254] rounded text-left"
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
                    return (
                      <div
                        key={`staged-${file.path}`}
                        className="grid grid-cols-[minmax(0,1fr)_20px_20px] items-center gap-1 w-full min-w-0"
                      >
                        <button
                          onClick={() => onFileSelect(file, "staged")}
                          className={`flex items-center gap-2 min-w-0 overflow-hidden px-2 py-1.5 rounded text-left hover:bg-[#4e5254] ${
                            selectedFile?.path === file.path ? "bg-[#4e5254]" : ""
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
                <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-[#4e5254] rounded">
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

                {list.id !== "default" && (
                  <div className="ml-8 -mt-1 mb-1 flex gap-2">
                    <button
                      className="text-[10px] text-[#787878] hover:bg-[#4e5254] rounded px-1"
                      onClick={() => {
                        setRenameTarget({ id: list.id, name: list.name });
                        setRenameName(list.name);
                        setRenameError(null);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="text-[10px] text-[#787878] hover:bg-[#4e5254] rounded px-1"
                      onClick={() => setDeleteTarget({ id: list.id, name: list.name })}
                    >
                      Delete
                    </button>
                  </div>
                )}

                {!isCollapsed && (
                  <div className="mt-1 ml-2">
                    {listFiles.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-[#787878]">No files</div>
                    ) : (
                      listFiles.map((file) => {
                        const icon = getFileIconInfo(file.path);
                        const { name, dir } = splitPath(file.path);
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
                              className={`flex items-center gap-2 min-w-0 overflow-hidden px-2 py-1.5 rounded text-left hover:bg-[#4e5254] ${
                                selectedFile?.path === file.path ? "bg-[#4e5254]" : ""
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
        </div>
      </ScrollArea>

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
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="bg-[#3c3f41] border-[#323232] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle>Delete Changelist</DialogTitle>
            <DialogDescription className="text-[#787878]">
              Delete changelist "{deleteTarget?.name}"? This cannot be undone.
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
