import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type {
  BranchList,
  ChangelistState,
  RepoDiffPayload,
  RepoStatus,
  RepoSummary,
  WorktreeList
} from "../types/ipc";

const REPO_ID = "e2e-repo";
const FILE_PATH = "src/scroll-target.ts";

const MOCK_REPO: RepoSummary = {
  repo_id: REPO_ID,
  path: "C:\\repos\\scroll-fixture",
  name: "scroll-fixture",
  repo_root: "C:\\repos\\scroll-fixture",
  worktree_path: "C:\\repos\\scroll-fixture",
  is_valid: true
};

const MOCK_STATUS: RepoStatus = {
  repo_id: REPO_ID,
  head: {
    branch_name: "main",
    oid_short: "a1b2c3d"
  },
  counts: {
    staged: 0,
    unstaged: 1,
    untracked: 0,
    conflicted: 0
  },
  files: [
    {
      path: FILE_PATH,
      status: "unstaged",
      changelist_id: "default",
      changelist_name: "Default"
    }
  ]
};

const MOCK_BRANCHES: BranchList = {
  current: "main",
  locals: ["main", "feature/ui-scroll"],
  remotes: ["origin/main"],
  ahead_behind: {
    main: { ahead: 1, behind: 0 }
  }
};

const MOCK_CHANGELISTS: ChangelistState = {
  lists: [
    {
      id: "default",
      name: "Default",
      created_at: Date.UTC(2026, 1, 10)
    }
  ],
  active_id: "default",
  assignments: {
    [FILE_PATH]: "default"
  },
  hunk_assignments: {}
};

const MOCK_WORKTREES: WorktreeList = {
  repo_root: MOCK_REPO.repo_root,
  worktrees: [
    {
      path: MOCK_REPO.worktree_path,
      branch: "main",
      head: MOCK_STATUS.head.oid_short
    }
  ]
};

const buildDiffPayload = (path: string, addedLines: number): RepoDiffPayload => {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileHeader = `diff --git a/${normalizedPath} b/${normalizedPath}\n--- a/${normalizedPath}\n+++ b/${normalizedPath}`;
  const hunkHeader = `@@ -1 +1,${addedLines} @@`;
  const additions = Array.from({ length: addedLines }, (_, index) => {
    const line = index + 1;
    const suffix = String(line).padStart(3, "0");
    return `+const scroll_line_${suffix} = "row-${suffix}";`;
  });

  const contentLines = ["-export const sentinel = 0;", ...additions];
  const content = contentLines.join("\n");
  const patch = `${fileHeader}\n${hunkHeader}\n${content}`;

  return {
    text: patch,
    hunks: [
      {
        path,
        kind: "unstaged",
        id: "mock-hunk-1",
        header: hunkHeader,
        old_start: 1,
        old_lines: 1,
        new_start: 1,
        new_lines: addedLines,
        content,
        content_hash: "mock-content-hash-1",
        file_header: fileHeader
      }
    ]
  };
};

const MOCK_DIFF_PAYLOAD = buildDiffPayload(FILE_PATH, 260);

const ensureReq = (args: unknown): Record<string, unknown> => {
  if (
    typeof args === "object" &&
    args !== null &&
    "req" in args &&
    typeof (args as { req?: unknown }).req === "object" &&
    (args as { req?: unknown }).req !== null
  ) {
    return (args as { req: Record<string, unknown> }).req;
  }
  return {};
};

export function installE2ETauriMocks() {
  mockWindows("main");
  mockIPC(
    (cmd, args) => {
      const req = ensureReq(args);

      switch (cmd) {
        case "repo_list_recent":
          return [];
        case "plugin:dialog|open":
          return MOCK_REPO.path;
        case "repo_open":
          return MOCK_REPO;
        case "repo_open_worktree":
          return {
            ...MOCK_REPO,
            worktree_path:
              typeof req.worktree_path === "string"
                ? req.worktree_path
                : MOCK_REPO.worktree_path
          };
        case "repo_status":
          return MOCK_STATUS;
        case "repo_branches":
          return MOCK_BRANCHES;
        case "cl_list":
          return MOCK_CHANGELISTS;
        case "wt_list":
          return MOCK_WORKTREES;
        case "repo_diff_payload": {
          const targetPath = typeof req.path === "string" ? req.path : "";
          if (targetPath === FILE_PATH) {
            return MOCK_DIFF_PAYLOAD;
          }
          return { text: "", hunks: [] };
        }
        case "repo_fetch":
          return { remote: "origin", updated: false };
        case "repo_checkout":
          return { head: MOCK_STATUS.head };
        case "repo_stage":
        case "repo_unstage":
        case "cl_assign_files":
        case "cl_create":
        case "cl_rename":
        case "cl_delete":
        case "cl_set_active":
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true }
  );
}
