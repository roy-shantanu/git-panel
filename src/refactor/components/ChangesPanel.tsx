import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileCode,
  FilePlus,
  FileX,
  Pencil,
  Plus,
  SplitSquareHorizontal,
  AlignJustify,
} from "lucide-react";
import { ScrollArea } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

interface ChangeGroup {
  title: string;
  files: FileChange[];
  expanded: boolean;
}

const mockChanges: ChangeGroup[] = [
  {
    title: "Changes (12)",
    expanded: true,
    files: [
      { path: "src/app/App.tsx", status: "modified", additions: 45, deletions: 12 },
      { path: "src/components/Header.tsx", status: "modified", additions: 23, deletions: 8 },
      { path: "src/components/Sidebar.tsx", status: "added", additions: 156, deletions: 0 },
      { path: "src/utils/helpers.ts", status: "modified", additions: 8, deletions: 3 },
      { path: "src/styles/theme.css", status: "deleted", additions: 0, deletions: 89 },
      { path: "src/api/client.ts", status: "modified", additions: 34, deletions: 21 },
      { path: "package.json", status: "modified", additions: 2, deletions: 1 },
      { path: "README.md", status: "modified", additions: 15, deletions: 4 },
      { path: "src/hooks/useAuth.ts", status: "added", additions: 67, deletions: 0 },
      { path: "src/types/user.ts", status: "modified", additions: 12, deletions: 2 },
      { path: "vite.config.ts", status: "modified", additions: 5, deletions: 1 },
      { path: "tsconfig.json", status: "modified", additions: 3, deletions: 0 },
    ],
  },
  {
    title: "Staged Changes (3)",
    expanded: false,
    files: [
      { path: "src/components/Button.tsx", status: "modified", additions: 18, deletions: 5 },
      { path: "src/index.tsx", status: "modified", additions: 7, deletions: 2 },
      { path: "public/favicon.ico", status: "added", additions: 0, deletions: 0 },
    ],
  },
];

const getStatusIcon = (status: FileChange["status"]) => {
  switch (status) {
    case "modified":
      return <Pencil className="size-3 text-[#6897bb]" />;
    case "added":
      return <FilePlus className="size-3 text-[#629755]" />;
    case "deleted":
      return <FileX className="size-3 text-[#c75450]" />;
  }
};

const getStatusColor = (status: FileChange["status"]) => {
  switch (status) {
    case "modified":
      return "text-[#6897bb]";
    case "added":
      return "text-[#629755]";
    case "deleted":
      return "text-[#c75450]";
  }
};

interface ChangesPanelProps {
  onFileSelect: (file: FileChange) => void;
  selectedFile: FileChange | null;
  viewMode: "unified" | "sideBySide";
  onViewModeChange: (mode: "unified" | "sideBySide") => void;
  showHunks: boolean;
  onShowHunksChange: (show: boolean) => void;
}

export function ChangesPanel({ 
  onFileSelect, 
  selectedFile,
  viewMode,
  onViewModeChange,
  showHunks,
  onShowHunksChange
}: ChangesPanelProps) {
  const [groups, setGroups] = useState<ChangeGroup[]>(mockChanges);

  const toggleGroup = (index: number) => {
    setGroups((prev) =>
      prev.map((group, i) =>
        i === index ? { ...group, expanded: !group.expanded } : group
      )
    );
  };

  return (
    <div className="w-80 border-r border-[#323232] bg-[#3c3f41] flex flex-col">
      <div className="px-4 py-3 border-b border-[#323232]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm text-[#bbbbbb]">Source Control</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 gap-1.5 text-xs hover:bg-[#4e5254] text-[#afb1b3]"
          >
            <Plus className="size-3.5" />
            <span>Add Changelist</span>
          </Button>
        </div>

        {/* View Options */}
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
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="mb-2">
              <button
                onClick={() => toggleGroup(groupIndex)}
                className="flex items-center gap-2 w-full px-2 py-1.5 hover:bg-[#4e5254] rounded text-left"
              >
                {group.expanded ? (
                  <ChevronDown className="size-4 text-[#afb1b3]" />
                ) : (
                  <ChevronRight className="size-4 text-[#afb1b3]" />
                )}
                <span className="text-sm text-[#bbbbbb]">{group.title}</span>
              </button>
              {group.expanded && (
                <div className="mt-1 ml-2">
                  {group.files.map((file, fileIndex) => (
                    <button
                      key={fileIndex}
                      onClick={() => onFileSelect(file)}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-left hover:bg-[#4e5254] group ${
                        selectedFile?.path === file.path ? "bg-[#4e5254]" : ""
                      }`}
                    >
                      <FileCode className="size-3.5 text-[#787878]" />
                      <span className={`text-xs flex-1 ${getStatusColor(file.status)}`}>
                        {file.path}
                      </span>
                      {getStatusIcon(file.status)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
