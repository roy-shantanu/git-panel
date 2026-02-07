import { ChevronDown, FolderGit2, Folder, Download, Upload, RefreshCw, GitCommit } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Worktree {
  name: string;
  path: string;
  branch: string;
}

interface Repository {
  name: string;
  path: string;
}

const repositories: Repository[] = [
  { name: "my-project", path: "/Users/dev/projects/my-project" },
  { name: "backend-api", path: "/Users/dev/projects/backend-api" },
  { name: "frontend-app", path: "/Users/dev/projects/frontend-app" },
  { name: "shared-library", path: "/Users/dev/projects/shared-library" },
];

const worktrees: Worktree[] = [
  { name: "main", path: "/Users/dev/project", branch: "main" },
  { name: "feature-branch", path: "/Users/dev/project-feature", branch: "feature/new-ui" },
  { name: "hotfix", path: "/Users/dev/project-hotfix", branch: "hotfix/bug-123" },
];

export function WorktreeSwitcher() {
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
              <Button variant="ghost" className="h-8 px-3 gap-2 text-sm hover:bg-[#4e5254]">
                <span className="text-[#bbbbbb]">my-project</span>
                <ChevronDown className="size-3 text-[#787878]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 bg-[#3c3f41] border-[#323232] text-[#bbbbbb] z-50">
              {repositories.map((repo) => (
                <DropdownMenuItem
                  key={repo.name}
                  className="flex flex-col items-start py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                >
                  <div className="flex items-center gap-2 w-full">
                    <Folder className="size-3 text-[#afb1b3]" />
                    <span className="text-sm text-[#bbbbbb]">{repo.name}</span>
                  </div>
                  <div className="text-xs text-[#787878] ml-5">{repo.path}</div>
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
              <Button variant="ghost" className="h-8 px-3 gap-2 text-sm hover:bg-[#4e5254]">
                <span className="text-[#bbbbbb]">main</span>
                <ChevronDown className="size-3 text-[#787878]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 bg-[#3c3f41] border-[#323232] text-[#bbbbbb] z-50">
              {worktrees.map((worktree) => (
                <DropdownMenuItem
                  key={worktree.name}
                  className="flex flex-col items-start py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
                >
                  <div className="flex items-center gap-2 w-full">
                    <FolderGit2 className="size-3 text-[#afb1b3]" />
                    <span className="text-sm text-[#bbbbbb]">{worktree.name}</span>
                  </div>
                  <div className="text-xs text-[#787878] ml-5">{worktree.path}</div>
                  <div className="text-xs text-[#287bde] ml-5">{worktree.branch}</div>
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
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Git Fetch"
        >
          <RefreshCw className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Git Pull"
        >
          <Download className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Git Push"
        >
          <Upload className="size-4" />
        </Button>

        <div className="h-5 w-px bg-[#323232] mx-1" />

        <Button
          variant="ghost"
          size="icon"
          className="size-8 hover:bg-[#4e5254] text-[#afb1b3]"
          title="Commit Staged"
        >
          <GitCommit className="size-4" />
        </Button>
      </div>
    </div>
  );
}
