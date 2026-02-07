import { GitBranch, GitCommit, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import type { RepoCounts } from "../../types/ipc";

interface BranchPanelProps {
  branchCurrent: string;
  localBranches: string[];
  remoteBranches: string[];
  aheadBehind: { ahead: number; behind: number } | null;
  counts?: RepoCounts;
  checkoutBusy: boolean;
  onCheckout: (type: "local" | "remote", name: string) => void;
}

export function BranchPanel({
  branchCurrent,
  localBranches,
  remoteBranches,
  aheadBehind,
  counts,
  checkoutBusy,
  onCheckout
}: BranchPanelProps) {
  return (
    <div className="h-8 border-t border-[#323232] bg-[#3c3f41] flex items-center px-4 gap-4">
      {/* Current Branch */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-6 px-2 gap-1.5 text-xs hover:bg-[#4e5254]"
            disabled={checkoutBusy}
          >
            <GitBranch className="size-3 text-[#afb1b3]" />
            <span className="text-[#bbbbbb]">{branchCurrent}</span>
            <ChevronDown className="size-3 text-[#787878]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="w-80 bg-[#3c3f41] border-[#323232] max-h-96 text-[#bbbbbb] z-50"
        >
          <div className="px-2 py-1.5 text-xs text-[#787878]">Local Branches</div>
          {localBranches.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-[#787878]">
              No local branches
            </DropdownMenuItem>
          )}
          {localBranches.map((branch) => (
            <DropdownMenuItem
              key={branch}
              onSelect={() => onCheckout("local", branch)}
              className="flex items-start gap-2 py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              <GitBranch className="size-3 text-[#afb1b3] mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#bbbbbb]">{branch}</div>
                <div className="text-xs text-[#787878] truncate">Local branch</div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="bg-[#323232]" />
          <div className="px-2 py-1.5 text-xs text-[#787878]">Remote Branches</div>
          {remoteBranches.length === 0 && (
            <DropdownMenuItem disabled className="text-xs text-[#787878]">
              No remote branches
            </DropdownMenuItem>
          )}
          {remoteBranches.map((branch) => (
            <DropdownMenuItem
              key={branch}
              onSelect={() => onCheckout("remote", branch)}
              className="flex items-start gap-2 py-2 px-3 cursor-pointer hover:bg-[#4e5254] focus:bg-[#4e5254]"
            >
              <GitBranch className="size-3 text-[#afb1b3] mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-[#bbbbbb]">{branch}</div>
                <div className="text-xs text-[#787878] truncate">Remote branch</div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sync Status */}
      <div className="flex items-center gap-1.5 text-xs text-[#787878]">
        <GitCommit className="size-3" />
        <span>
          {aheadBehind
            ? `${aheadBehind.ahead} commits ahead, ${aheadBehind.behind} behind`
            : "No ahead/behind data"}
        </span>
      </div>

      {/* Status Info */}
      <div className="ml-auto flex items-center gap-3 text-xs text-[#787878]">
        <span>{(counts?.staged ?? 0) + (counts?.unstaged ?? 0) + (counts?.untracked ?? 0)} changes</span>
        <span>•</span>
        <span>{counts?.staged ?? 0} staged</span>
      </div>
    </div>
  );
}
