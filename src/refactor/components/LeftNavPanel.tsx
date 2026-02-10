import { useState } from "react";
import { GitCommit, Settings, History, Search, GitBranch } from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Switch } from "./ui/switch";
import { Separator } from "./ui/separator";

interface LeftNavPanelProps {
  onCommitClick: () => void;
  onSourceControlToggle: () => void;
  isSourceControlOpen: boolean;
}

export function LeftNavPanel({ onCommitClick, onSourceControlToggle, isSourceControlOpen }: LeftNavPanelProps) {
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  return (
    <div className="w-12 shrink-0 bg-[#3c3f41] border-r border-[#2b2b2b] flex flex-col items-center py-2 gap-1">
      {/* Source Control Button */}
      <Button
        variant="ghost"
        size="icon"
        className={`size-10 hover:bg-[#4e5254] text-[#afb1b3] ${
          isSourceControlOpen ? "bg-[#4e5254]" : ""
        }`}
        title="Source Control"
        onClick={onSourceControlToggle}
      >
        <GitBranch className="size-5" />
      </Button>

      {/* Commit Button */}
      <Button
        variant="ghost"
        size="icon"
        className="size-10 hover:bg-[#4e5254] text-[#afb1b3]"
        title="Commit"
        onClick={onCommitClick}
      >
        <GitCommit className="size-5" />
      </Button>

      {/* History Button */}
      <Button
        variant="ghost"
        size="icon"
        className="size-10 hover:bg-[#4e5254] text-[#afb1b3]"
        title="History"
      >
        <History className="size-5" />
      </Button>

      {/* Search Button */}
      <Button
        variant="ghost"
        size="icon"
        className="size-10 hover:bg-[#4e5254] text-[#afb1b3]"
        title="Search in Changes"
      >
        <Search className="size-5" />
      </Button>

      <div className="flex-1" />

      {/* Settings Button */}
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 hover:bg-[#4e5254] text-[#afb1b3]"
            title="Settings"
          >
            <Settings className="size-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-[#3c3f41] border-[#2b2b2b] text-[#bbbbbb]">
          <DialogHeader>
            <DialogTitle className="text-[#bbbbbb]">Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="theme-toggle" className="text-[#bbbbbb]">
                Dark Theme
              </Label>
              <Switch
                id="theme-toggle"
                checked={isDarkTheme}
                onCheckedChange={setIsDarkTheme}
              />
            </div>
            <Separator className="bg-[#2b2b2b]" />
            <div className="space-y-2">
              <h3 className="text-sm text-[#bbbbbb]">Editor Settings</h3>
              <div className="flex items-center justify-between">
                <Label htmlFor="line-numbers" className="text-sm text-[#afb1b3]">
                  Show Line Numbers
                </Label>
                <Switch id="line-numbers" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="whitespace" className="text-sm text-[#afb1b3]">
                  Show Whitespace
                </Label>
                <Switch id="whitespace" />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
