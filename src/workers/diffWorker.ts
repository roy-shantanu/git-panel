import { DiffFile } from "@git-diff-view/core";

type DiffData = {
  oldFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
  newFile?: { fileName?: string | null; fileLang?: string | null; content?: string | null };
  hunks: string[];
};

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
  data: DiffData;
  bundle: ReturnType<DiffFile["getBundle"]>;
};

type DiffWorkerError = {
  type: "error";
  requestId: number;
  durationMs: number;
  error: string;
};

type DiffWorkerResponse = DiffWorkerSuccess | DiffWorkerError;

const sanitizePatchText = (text: string) =>
  text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    .split("\0")
    .join("");

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/;
const DIFF_LINE_PREFIX_RE = /^[ +\-\\]/;

const normalizePath = (path: string) =>
  path.replace(/\\/g, "/").replace(/^\.\//, "");

const tokenizeDiffHeader = (line: string): string[] => {
  if (!line.startsWith("diff --git ")) return [];
  const source = line.slice("diff --git ".length);
  const tokens: string[] = [];
  let index = 0;

  while (index < source.length) {
    while (index < source.length && /\s/.test(source[index])) index += 1;
    if (index >= source.length) break;

    if (source[index] === "\"") {
      index += 1;
      let token = "";
      let escaped = false;
      while (index < source.length) {
        const ch = source[index];
        index += 1;
        if (escaped) {
          token += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === "\"") break;
        token += ch;
      }
      tokens.push(token);
      continue;
    }

    const start = index;
    while (index < source.length && !/\s/.test(source[index])) index += 1;
    tokens.push(source.slice(start, index));
  }

  return tokens;
};

const extractBPath = (diffHeader: string): string | null => {
  const tokens = tokenizeDiffHeader(diffHeader.trim());
  if (tokens.length < 2) return null;
  return normalizePath(tokens[1].replace(/^b\//, ""));
};

const extractSingleFilePatch = (patchText: string, filePath: string) => {
  const normalizedPath = normalizePath(filePath);
  const text = sanitizePatchText(patchText);
  if (!text.startsWith("diff --git ")) return text;

  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
      }
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  if (blocks.length <= 1) return blocks[0] ?? text;

  let fallbackWithHunk: string | null = null;
  const fallbackFirst: string | null = blocks[0] ?? null;
  for (const block of blocks) {
    const firstLine = block.split("\n", 1)[0] ?? "";
    const bPath = extractBPath(firstLine);
    if (bPath === normalizedPath) {
      return block;
    }
    if (!fallbackWithHunk && /\n@@ /.test(block)) {
      fallbackWithHunk = block;
    }
  }

  const targetName = normalizedPath.split("/").pop();
  if (targetName) {
    for (const block of blocks) {
      const firstLine = block.split("\n", 1)[0] ?? "";
      const bPath = extractBPath(firstLine);
      if (bPath && bPath.split("/").pop() === targetName) {
        return block;
      }
    }
  }

  return fallbackWithHunk ?? fallbackFirst ?? text;
};

const hasHunkHeader = (text: string) => /(^|\n)@@ /.test(text);

const toSyntheticHeader = (filePath: string) => {
  const normalizedPath = normalizePath(filePath);
  return `diff --git a/${normalizedPath} b/${normalizedPath}\n--- a/${normalizedPath}\n+++ b/${normalizedPath}`;
};

const canonicalizePatch = (filePath: string, text: string) => {
  const patch = sanitizePatchText(text).trim();
  if (!patch) return "";

  const lines = patch.split("\n");
  const hunkStart = lines.findIndex((line) => HUNK_HEADER_RE.test(line));
  if (hunkStart < 0) return patch;

  const headerLines = lines.slice(0, hunkStart);
  const plusPlusIndex = headerLines.findIndex((line) => line.startsWith("+++ "));
  const minusMinusIndex = headerLines.findIndex((line) => line.startsWith("--- "));
  const validHeader =
    plusPlusIndex >= 0 && minusMinusIndex >= 0 && minusMinusIndex < plusPlusIndex;

  const header = validHeader
    ? headerLines.slice(0, plusPlusIndex + 1).join("\n")
    : toSyntheticHeader(filePath);

  const body: string[] = [];
  let inHunk = false;
  for (let index = hunkStart; index < lines.length; index += 1) {
    const line = lines[index];

    if (line.startsWith("diff --git ")) {
      if (inHunk) break;
      continue;
    }

    if (HUNK_HEADER_RE.test(line)) {
      inHunk = true;
      body.push(line);
      continue;
    }

    if (!inHunk) continue;

    if (DIFF_LINE_PREFIX_RE.test(line)) {
      body.push(line);
      continue;
    }

    // Keep parser progress even when upstream line prefixes are missing.
    body.push(line.length === 0 ? " " : ` ${line}`);
  }

  if (body.length === 0) return patch;
  return `${header}\n${body.join("\n")}`;
};

const createParsedDiff = (
  filePath: string,
  patchText: string,
  oldContent: string,
  newContent: string,
  theme: "light" | "dark"
) => {
  const file = new DiffFile(filePath, oldContent, filePath, newContent, [patchText], "", "");
  file.initTheme(theme);
  file.initRaw();
  file.buildSplitDiffLines();
  file.buildUnifiedDiffLines();
  return file;
};

const deriveFileContentsFromPatch = (patchText: string) => {
  const lines = patchText.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (HUNK_HEADER_RE.test(line)) {
      inHunk = true;
      continue;
    }

    if (!inHunk) continue;

    if (line.startsWith("diff --git ")) break;
    if (line.startsWith("@@ ")) continue;
    if (line.startsWith("\\ No newline at end of file")) continue;

    const prefix = line[0] ?? "";
    const content = line.length > 0 ? line.slice(1) : "";

    if (prefix === "+") {
      newLines.push(content);
      continue;
    }
    if (prefix === "-") {
      oldLines.push(content);
      continue;
    }
    if (prefix === " ") {
      oldLines.push(content);
      newLines.push(content);
      continue;
    }

    // Unexpected line shape inside hunk: keep both sides aligned.
    oldLines.push(line);
    newLines.push(line);
  }

  return {
    oldContent: oldLines.join("\n"),
    newContent: newLines.join("\n")
  };
};

const buildDiffBundle = (
  filePath: string,
  patchText: string,
  theme: "light" | "dark"
): { data: DiffData; bundle: ReturnType<DiffFile["getBundle"]> } => {
  const extracted = extractSingleFilePatch(patchText, filePath);
  const usedPatch = canonicalizePatch(filePath, extracted);
  let file = createParsedDiff(filePath, usedPatch, "", "", theme);

  if (hasHunkHeader(usedPatch) && file.splitLineLength === 0) {
    const recovered = deriveFileContentsFromPatch(usedPatch);
    file = createParsedDiff(
      filePath,
      usedPatch,
      recovered.oldContent,
      recovered.newContent,
      theme
    );
  }

  if (hasHunkHeader(usedPatch) && file.splitLineLength === 0) {
    throw new Error("Parsed empty diff from hunked patch");
  }

  return {
    data: {
      oldFile: { fileName: filePath, content: "", fileLang: "" },
      newFile: { fileName: filePath, content: "", fileLang: "" },
      hunks: [usedPatch]
    },
    bundle: file.getBundle()
  };
};

self.addEventListener("message", (event: MessageEvent<DiffWorkerRequest>) => {
  const { requestId, filePath, patchText, fallbackPatch, theme } = event.data;
  const start = performance.now();
  const candidates: string[] = [];
  if (fallbackPatch && hasHunkHeader(sanitizePatchText(fallbackPatch))) {
    candidates.push(canonicalizePatch(filePath, fallbackPatch));
  }
  candidates.push(canonicalizePatch(filePath, patchText));

  const errors: string[] = [];
  const tried = new Set<string>();
  for (const candidate of candidates) {
    if (!candidate || tried.has(candidate)) continue;
    tried.add(candidate);
    try {
      const built = buildDiffBundle(filePath, candidate, theme);
      const response: DiffWorkerResponse = {
        type: "success",
        requestId,
        durationMs: Math.round(performance.now() - start),
        data: built.data,
        bundle: built.bundle
      };
      self.postMessage(response);
      return;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const response: DiffWorkerResponse = {
    type: "error",
    requestId,
    durationMs: Math.round(performance.now() - start),
    error: errors.join(" | ") || "Diff worker parse failed"
  };
  self.postMessage(response);
});
