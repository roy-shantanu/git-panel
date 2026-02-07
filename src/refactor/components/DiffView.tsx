import { useMemo } from "react";
import {
  DiffModeEnum,
  DiffView as GitDiffView
} from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FileCode, Plus, Minus } from "lucide-react";

interface DiffViewProps {
  fileName: string;
  additions: number;
  deletions: number;
  viewMode: "unified" | "sideBySide";
  showHunks: boolean;
}

export function DiffView({ fileName, additions, deletions, viewMode, showHunks }: DiffViewProps) {
  const diffData = useMemo(
    () => ({
      oldFile: {
        fileName,
        fileLang: "tsx",
        content: [
          "import React from 'react';",
          "import { Button } from './components/Button';",
          "",
          "export default function App() {",
          "  return (",
          "    <div className=\"container\">",
          "      <h1>Welcome to the App</h1>",
          "      <Button>Click me</Button>",
          "      <p>This is a sample application.</p>",
          "    </div>",
          "  );",
          "}"
        ].join("\n")
      },
      newFile: {
        fileName,
        fileLang: "tsx",
        content: [
          "import React from 'react';",
          "import { Button } from './components/Button';",
          "import { Header } from './components/Header';",
          "import { Sidebar } from './components/Sidebar';",
          "",
          "export default function App() {",
          "  return (",
          "    <div className=\"flex h-screen\">",
          "      <Sidebar />",
          "      <main className=\"flex-1\">",
          "        <Header />",
          "        <h1>Welcome to the App</h1>",
          "        <Button variant=\"primary\">Click me</Button>",
          "        <p>This is a sample application.</p>",
          "      </main>",
          "    </div>",
          "  );",
          "}"
        ].join("\n")
      },
      hunks: [
        [
          "@@ -1,12 +1,18 @@",
          " import React from 'react';",
          " import { Button } from './components/Button';",
          "+import { Header } from './components/Header';",
          "+import { Sidebar } from './components/Sidebar';",
          " ",
          " export default function App() {",
          "   return (",
          "-    <div className=\"container\">",
          "+    <div className=\"flex h-screen\">",
          "+      <Sidebar />",
          "+      <main className=\"flex-1\">",
          "+        <Header />",
          "       <h1>Welcome to the App</h1>",
          "-      <Button>Click me</Button>",
          "+        <Button variant=\"primary\">Click me</Button>",
          "       <p>This is a sample application.</p>",
          "+      </main>",
          "     </div>",
          "   );",
          " }"
        ].join("\n")
      ]
    }),
    [fileName]
  );

  const diffMode =
    viewMode === "sideBySide" ? DiffModeEnum.Split : DiffModeEnum.Unified;

  return (
    <div className="flex-1 bg-[#2b2b2b] flex flex-col">
      {/* Header */}
      <div className="border-b border-[#323232] px-6 py-4 bg-[#3c3f41]">
        <div className="flex items-center gap-3 mb-2">
          <FileCode className="size-5 text-[#afb1b3]" />
          <h2 className="text-base text-[#bbbbbb]">{fileName}</h2>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Plus className="size-3.5 text-[#629755]" />
            <span className="text-[#629755]">{additions} additions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus className="size-3.5 text-[#c75450]" />
            <span className="text-[#c75450]">{deletions} deletions</span>
          </div>
        </div>
      </div>

      {/* Diff Content */}
      <div className="refactor-diff-shell">
        <GitDiffView
          data={diffData}
          diffViewMode={diffMode}
          diffViewTheme="dark"
          diffViewHighlight
          className={showHunks ? "refactor-diff-view" : "refactor-diff-view refactor-hide-hunks"}
        />
      </div>
    </div>
  );
}
