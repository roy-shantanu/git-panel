/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import { DiffFile, DiffModeEnum, DiffView as GitDiffView } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view-pure.css";
import { FileCode, Minus, Plus } from "lucide-react";
import type { DiffHunk } from "../../types/ipc";

type DiffWorkerRequest = {
  requestId: number;
  filePath: string;
  patchText: string;
  fallbackPatch?: string;
  theme: "light" | "dark";
};

type DiffWorkerSuccess = {
  type: "success";
  requestId: number;
  durationMs: number;
  data: {
    oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
    hunks: string[];
  };
  bundle: ReturnType<DiffFile["getBundle"]>;
};

type DiffWorkerError = {
  type: "error";
  requestId: number;
  durationMs: number;
  error: string;
};

type DiffWorkerResponse = DiffWorkerSuccess | DiffWorkerError;

interface DiffViewProps {
  fileName: string;
  payload: { text: string; hunks: DiffHunk[] } | null;
  loading: boolean;
  error: string | null;
  viewMode: "unified" | "sideBySide";
  showHunks: boolean;
}

const sanitizePatchText = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .split("\0")
    .join("");

const isBinaryPatchText = (text: string) => {
  if (!text) return false;
  return (
    /(^|\n)Binary files .* differ(?:\n|$)/.test(text) ||
    /(^|\n)GIT binary patch(?:\n|$)/.test(text)
  );
};

const buildPatchFromHunks = (filePath: string, hunks: DiffHunk[]) => {
  if (hunks.length === 0) return "";

  const normalizedPath = filePath.replace(/\\/g, "/");
  const syntheticHeader = `diff --git a/${normalizedPath} b/${normalizedPath}\n--- a/${normalizedPath}\n+++ b/${normalizedPath}`;

  const lines: string[] = [];
  let lastHeader = "";
  for (const hunk of hunks) {
    const content = hunk.content ? sanitizePatchText(hunk.content) : "";
    if (!content.trim()) continue;
    const header = sanitizePatchText(hunk.file_header);
    if (header && header !== lastHeader) {
      lines.push(header);
      lastHeader = header;
    }
    lines.push(hunk.header);
    lines.push(content);
  }

  const body = lines.filter(Boolean).join("\n");
  return body.startsWith("diff --git ") ? body : `${syntheticHeader}\n${body}`;
};

const countDiffLines = (hunks: DiffHunk[]) => {
  let additions = 0;
  let deletions = 0;
  for (const hunk of hunks) {
    const content = sanitizePatchText(hunk.content ?? "");
    if (!content) continue;
    for (const line of content.split("\n")) {
      if (!line) continue;
      if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
      if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
    }
  }
  return { additions, deletions };
};

type PayloadMeta =
  | { mode: "none" }
  | { mode: "empty" }
  | { mode: "binary" }
  | { mode: "render"; patchText: string; fallbackPatch: string };

export function DiffView({
  fileName,
  payload,
  loading,
  error,
  viewMode,
  showHunks
}: DiffViewProps) {
  const [diffFile, setDiffFile] = useState<DiffFile | null>(null);
  const [diffParsing, setDiffParsing] = useState(false);
  const [diffParseError, setDiffParseError] = useState<string | null>(null);
  const diffWorkerRef = useRef<Worker | null>(null);
  const diffWorkerRequestIdRef = useRef(0);

  const stats = useMemo(() => countDiffLines(payload?.hunks ?? []), [payload?.hunks]);
  const payloadMeta = useMemo<PayloadMeta>(() => {
    if (!payload) return { mode: "none" };
    const diffText = payload.text ?? "";
    const diffHunks = payload.hunks ?? [];
    if (!diffText && diffHunks.length === 0) return { mode: "empty" };
    if (isBinaryPatchText(diffText)) return { mode: "binary" };

    const primaryPatch = sanitizePatchText(diffText);
    const fallbackPatch = buildPatchFromHunks(fileName, diffHunks);
    const patchText = primaryPatch || fallbackPatch;
    if (!patchText) return { mode: "empty" };

    return { mode: "render", patchText, fallbackPatch };
  }, [fileName, payload]);

  useEffect(() => {
    const worker = new Worker(new URL("../../workers/diffWorker.ts", import.meta.url), {
      type: "module"
    });
    diffWorkerRef.current = worker;

    const onMessage = (event: MessageEvent<DiffWorkerResponse>) => {
      const message = event.data;
      if (message.requestId !== diffWorkerRequestIdRef.current) return;
      setDiffParsing(false);

      if (message.type === "success") {
        try {
          const nextDiffFile = DiffFile.createInstance(message.data, message.bundle);
          setDiffFile(nextDiffFile);
          setDiffParseError(null);
        } catch (hydrateError) {
          console.error("diff bundle hydrate failed", hydrateError);
          setDiffFile(null);
          setDiffParseError("Diff parse hydrate failed.");
        }
        return;
      }

      console.error("diff worker parse failed", message.error);
      setDiffFile(null);
      setDiffParseError(message.error || "Diff could not be parsed.");
    };

    worker.addEventListener("message", onMessage);
    return () => {
      worker.removeEventListener("message", onMessage);
      worker.terminate();
      diffWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (payloadMeta.mode !== "render") {
      return;
    }

    const worker = diffWorkerRef.current;
    if (!worker) return;

    const requestId = diffWorkerRequestIdRef.current + 1;
    diffWorkerRequestIdRef.current = requestId;
    setDiffParsing(true);
    setDiffParseError(null);
    worker.postMessage({
      requestId,
      filePath: fileName,
      patchText: payloadMeta.patchText,
      fallbackPatch: payloadMeta.fallbackPatch,
      theme: "dark"
    } satisfies DiffWorkerRequest);
  }, [fileName, payloadMeta]);

  const diffMode = viewMode === "sideBySide" ? DiffModeEnum.Split : DiffModeEnum.Unified;
  const isBusy = loading || diffParsing;
  const visibleError =
    error || (payloadMeta.mode === "render" ? diffParseError : null);

  return (
    <div className="h-full min-w-0 min-h-0 flex flex-col bg-[#2b2b2b] overflow-hidden">
      <div className="shrink-0 border-b border-[#323232] px-6 py-4 bg-[#3c3f41]">
        <div className="flex items-center gap-3 mb-2 min-w-0">
          <FileCode className="size-5 text-[#afb1b3]" />
          <h2 className="text-base text-[#bbbbbb] truncate" title={fileName}>
            {fileName}
          </h2>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5">
            <Plus className="size-3.5 text-[#629755]" />
            <span className="text-[#629755]">{stats.additions} additions</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Minus className="size-3.5 text-[#c75450]" />
            <span className="text-[#c75450]">{stats.deletions} deletions</span>
          </div>
        </div>
      </div>

      <div className="refactor-diff-shell">
        {isBusy && <div className="text-xs text-[#787878] p-3">Loading diff...</div>}
        {!isBusy && visibleError && <div className="text-xs text-[#c75450] p-3">{visibleError}</div>}
        {!isBusy && !visibleError && payloadMeta.mode === "none" && (
          <div className="text-xs text-[#787878] p-3">No diff to display.</div>
        )}
        {!isBusy && !visibleError && payloadMeta.mode === "empty" && (
          <div className="text-xs text-[#787878] p-3">No diff to display.</div>
        )}
        {!isBusy && !visibleError && payloadMeta.mode === "binary" && (
          <div className="text-xs text-[#787878] p-3">Binary diff cannot be rendered.</div>
        )}
        {!isBusy && !visibleError && payloadMeta.mode === "render" && !diffFile && (
          <div className="text-xs text-[#787878] p-3">No diff to display.</div>
        )}
        {!isBusy && !visibleError && payloadMeta.mode === "render" && diffFile && (
          <div className="refactor-diff-view">
            <GitDiffView
              diffFile={diffFile}
              diffViewMode={diffMode}
              diffViewTheme="dark"
              diffViewWrap={false}
              diffViewHighlight={false}
              className={showHunks ? "" : "refactor-hide-hunks"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
