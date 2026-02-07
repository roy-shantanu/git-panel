import { GitBranch, GitCommit, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Branch {
  name: string;
  lastCommit: string;
  isRemote?: boolean;
}

const branches: Branch[] = [
  { name: "main", lastCommit: "Initial commit" },
  { name: "develop", lastCommit: "Add new feature" },
  { name: "feature/new-ui", lastCommit: "Update UI components" },
  { name: "hotfix/bug-123", lastCommit: "Fix critical bug" },
  { name: "origin/main", lastCommit: "Initial commit", isRemote: true },
  { name: "origin/develop", lastCommit: "Add new feature", isRemote: true },
];

const localBranches = branches.filter((b) => !b.isRemote);
const remoteBranches = branches.filter((b) => b.isRemote);

export function BranchPanel() {
  return (
    <div className="h-8 border-t border-[#323232] bg-[#3c3f41] flex items-center px-4 gap-4">
      {/* Current Branch */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-6 px-2 gap-1.5 text-xs hover:bg-[#4e5254]"
          >
            <GitBranch className="size-3 text-[#afb1b3]" />
            <span className="text-[#bbbbbb]">main</span>
            <ChevronDown className="size-3 text-[#787878]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-80 bg-[#3c3f41] border-[#323232] max-h-96 text-[#bbbbbb] z-50"
        >
          <div className="px-2 py-1.5 text-xs text-[#787878]">Local Branches</div>
          {localBranches.map((branch) => (
            <DropdownMenuItem
              key={branch.name}
              className="flex items-start gap-2 py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              <GitBranch className="size-3 text-[#afb1b3] mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#bbbbbb]">{branch.name}</div>
                <div className="text-xs text-[#787878] truncate">{branch.lastCommit}</div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-[#323232]" />
          <div className="px-2 py-1.5 text-xs text-[#787878]">Remote Branches</div>
          {remoteBranches.map((branch) => (
            <DropdownMenuItem
              key={branch.name}
              className="flex items-start gap-2 py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              <GitBranch className="size-3 text-[#afb1b3] mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#bbbbbb]">{branch.name}</div>
                <div className="text-xs text-[#787878] truncate">{branch.lastCommit}</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sync Status */}
      <div className="flex items-center gap-1.5 text-xs text-[#787878]">
        <GitCommit className="size-3" />
        <span>3 commits ahead, 1 behind</span>
      </div>

      {/* Status Info */}
      <div className="ml-auto flex items-center gap-3 text-xs text-[#787878]">
        <span>12 changes</span>
        <span>•</span>
        <span>3 staged</span>
      </div>
    </div>
  );
}