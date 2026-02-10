import { ChevronDown, FolderGit2, Folder, Download, Upload, RefreshCw, GitCommit } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { RepoListItem, RepoSummary, WorktreeInfo } from "../../types/ipc";

interface WorktreeSwitcherProps {
  repo?: RepoSummary;
  recent: RepoListItem[];
  worktrees: WorktreeInfo[];
  repoBusy: boolean;
  worktreeBusy: boolean;
  fetchBusy: boolean;
  onOpenRepo: () => void;
  onSelectRecentRepo: (path: string) => void;
  onSelectWorktree: (path: string) => void;
  onFetch: () => void;
}

const getWorktreeName = (path: string) => {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
};

const formatHomeRelativePath = (path: string) => {
  const normalized = path.replace(/\//g, "\\");
  const homeMatch = normalized.match(/^[A-Za-z]:\\Users\\[^\\]+/i);
  if (!homeMatch) return normalized;
  const suffix = normalized.slice(homeMatch[0].length);
  return suffix ? `~${suffix}` : "~";
};

export function WorktreeSwitcher({
  repo,
  recent,
  worktrees,
  repoBusy,
  worktreeBusy,
  fetchBusy,
  onOpenRepo,
  onSelectRecentRepo,
  onSelectWorktree,
  onFetch
}: WorktreeSwitcherProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-[#323232] bg-[#3c3f41]">
      {/* Left side - Repository and Worktree selectors */}
      <div className="flex items-center gap-6">
        {/* Repository Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#787878] uppercase tracking-wide">Repo</span>
          <Folder className="size-4 text-[#afb1b3]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 px-2.5 gap-1.5 text-xs hover:bg-[#4e5254]"
                disabled={repoBusy}
              >
                <span className="text-[#bbbbbb]">{repo?.name ?? "Open repository"}</span>
                <ChevronDown className="size-3 text-[#787878]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 bg-[#3c3f41] border-[#323232] text-[#bbbbbb] z-50">
              <DropdownMenuItem
                onSelect={() => {
                  setTimeout(() => {
                    onOpenRepo();
                  }, 0);
                }}
                className="flex items-center gap-2 py-1.5 px-2.5 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
              >
                <Folder className="size-3 text-[#afb1b3]" />
                <span className="text-xs text-[#bbbbbb]">Open...</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#323232]" />
              {recent.length === 0 && (
                <DropdownMenuItem disabled className="text-xs text-[#787878]">
                  No recent repositories
                </DropdownMenuItem>
              )}
              {recent.map((repoItem) => (
                <DropdownMenuItem
                  key={repoItem.repo_id}
                  onSelect={() => onSelectRecentRepo(repoItem.path)}
                  className="flex items-center gap-2 py-1.5 px-2.5 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                >
                  <Folder className="size-3 text-[#afb1b3]" />
                  <span className="text-xs text-[#bbbbbb] shrink-0">{repoItem.name}</span>
                  <span className="text-xs text-[#787878] truncate min-w-0">
                    {formatHomeRelativePath(repoItem.path)}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-[#323232]" />

        {/* Worktree Selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#787878] uppercase tracking-wide">Worktree</span>
          <FolderGit2 className="size-4 text-[#afb1b3]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-7 px-2.5 gap-1.5 text-xs hover:bg-[#4e5254]"
                disabled={!repo || worktreeBusy || worktrees.length === 0}
              >
                <span className="text-[#bbbbbb]">
                  {repo ? getWorktreeName(repo.worktree_path) : "No worktree"}
                </span>
                <ChevronDown className="size-3 text-[#787878]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-96 bg-[#3c3f41] border-[#323232] text-[#bbbbbb] z-50">
              {worktrees.length === 0 && (
                <DropdownMenuItem disabled className="text-xs text-[#787878]">
                  {repo?.worktree_path ?? "No worktrees"}
                </DropdownMenuItem>
              )}
              {worktrees.map((worktree) => (
                <DropdownMenuItem
                  key={worktree.path}
                  onSelect={() => onSelectWorktree(worktree.path)}
                  className="flex flex-col items-start py-1.5 px-2.5 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                >
                  <div className="flex items-center gap-2 w-full min-w-0">
                    <FolderGit2 className="size-3 text-[#afb1b3]" />
                    <span className="text-xs text-[#bbbbbb] shrink-0">
                      {getWorktreeName(worktree.path)}
                    </span>
                    <span className="text-xs text-[#787878] truncate min-w-0">
                      {formatHomeRelativePath(worktree.path)}
                    </span>
                  </div>
                  <span className="text-xs text-[#787878] ml-5">{worktree.branch}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Right side - Git action buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className={`size-8 hover:bg-[#4e5254] text-[#afb1b3] ${fetchBusy ? "animate-spin" : ""}`}
          title="Git Fetch"
          disabled={!repo || fetchBusy}
          onClick={onFetch}
        >
          <RefreshCw className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Git Pull"
          disabled
        >
          <Download className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Git Push"
          disabled
        >
          <Upload className="size-4" />
        </Button>

        <div className="h-5 w-px bg-[#323232] mx-1" />

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Commit Staged"
          disabled
        >
          <GitCommit className="size-4" />
        </Button>
      </div>
    </div>
  );
}
