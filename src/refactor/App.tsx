import { useState } from "react";
import { WorktreeSwitcher } from "./components/WorktreeSwitcher";
import { LeftNavPanel } from "./components/LeftNavPanel";
import { ChangesPanel } from "./components/ChangesPanel";
import { DiffView } from "./components/DiffView";
import { BranchPanel } from "./components/BranchPanel";

interface FileChange {
  path: string;
  status: "modified" | "added" | "deleted";
  additions: number;
  deletions: number;
}

export default function App() {
  const [selectedFile, setSelectedFile] = useState<FileChange | null>({
    path: "src/app/App.tsx",
    status: "modified",
    additions: 45,
    deletions: 12,
  });
  const [viewMode, setViewMode] = useState<"unified" | "sideBySide">("unified");
  const [showHunks, setShowHunks] = useState(false);
  const [isSourceControlOpen, setIsSourceControlOpen] = useState(true);

  const handleCommit = () => {
    console.log("Commit clicked");
    // Handle commit action
  };

  const toggleSourceControl = () => {
    setIsSourceControlOpen((prev) => !prev);
  };

  return (
    <div className="size-full flex flex-col bg-[#2b2b2b]">
      {/* Top Bar - Worktree Switcher */}
      <WorktreeSwitcher />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Nav Panel */}
        <LeftNavPanel 
          onCommitClick={handleCommit}
          onSourceControlToggle={toggleSourceControl}
          isSourceControlOpen={isSourceControlOpen}
        />

        {/* Left Sidebar - Changes Panel */}
        {isSourceControlOpen && (
          <ChangesPanel 
            onFileSelect={setSelectedFile} 
            selectedFile={selectedFile}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            showHunks={showHunks}
            onShowHunksChange={setShowHunks}
          />
        )}

        {/* Center - Diff View */}
        {selectedFile ? (
          <DiffView
            fileName={selectedFile.path}
            additions={selectedFile.additions}
            deletions={selectedFile.deletions}
            viewMode={viewMode}
            showHunks={showHunks}
          />
        ) : (
          <div className="flex-1 bg-[#2b2b2b] flex items-center justify-center">
            <p className="text-[#787878]">Select a file to view changes</p>
          </div>
        )}
      </div>

      {/* Bottom Bar - Branch Panel */}
      <BranchPanel />
    </div>
  );
}