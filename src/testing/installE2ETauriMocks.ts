import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type {
  BranchList,
  Changelist,
  ChangelistState,
  RepoDiffKind,
  RepoDiffPayload,
  RepoStatus,
  RepoSummary,
  StatusFile,
  WorktreeList
} from "../types/ipc";

const REPO_ID = "e2e-repo";
const SCROLL_FILE_PATH = "src/scroll-target.ts";
const MIXED_FILE_PATH = "src/mixed-target.ts";
const UNVERSIONED_FILE_PATH = "src/unversioned-target.ts";
const DEFAULT_CHANGE_LIST_ID = "default";

const deepCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const isStagedStatus = (status: StatusFile["status"]) =>
  status === "staged" || status === "both";

const isUnstagedStatus = (status: StatusFile["status"]) =>
  status === "unstaged" ||
  status === "untracked" ||
  status === "both" ||
  status === "conflicted";

const nextStatusAfterStage = (status: StatusFile["status"]): StatusFile["status"] => {
  if (status === "unstaged" || status === "untracked" || status === "both") {
    return "staged";
  }
  return status;
};

const nextStatusAfterUnstage = (status: StatusFile["status"]): StatusFile["status"] => {
  if (status === "staged" || status === "both") {
    return "unstaged";
  }
  return status;
};

const nextStatusAfterTrack = (status: StatusFile["status"]): StatusFile["status"] => {
  if (status === "untracked") {
    return "unstaged";
  }
  return status;
};

const nextStatusAfterCommit = (status: StatusFile["status"]): StatusFile["status"] | null => {
  if (status === "staged") return null;
  if (status === "both") return "unstaged";
  return status;
};

const computeCounts = (files: StatusFile[]) => {
  let staged = 0;
  let unstaged = 0;
  let untracked = 0;
  let conflicted = 0;
  for (const file of files) {
    if (isStagedStatus(file.status)) staged += 1;
    if (isUnstagedStatus(file.status)) unstaged += 1;
    if (file.status === "untracked") untracked += 1;
    if (file.status === "conflicted") conflicted += 1;
  }
  return { staged, unstaged, untracked, conflicted };
};

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

const ensureStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
};

const MOCK_REPO: RepoSummary = {
  repo_id: REPO_ID,
  path: "C:\\repos\\scroll-fixture",
  name: "scroll-fixture",
  repo_root: "C:\\repos\\scroll-fixture",
  worktree_path: "C:\\repos\\scroll-fixture",
  is_valid: true
};

const MOCK_BRANCHES: BranchList = {
  current: "main",
  locals: ["main", "feature/ui-scroll"],
  remotes: ["origin/main"],
  ahead_behind: {
    main: { ahead: 1, behind: 0 }
  }
};

const MOCK_WORKTREES: WorktreeList = {
  repo_root: MOCK_REPO.repo_root,
  worktrees: [
    {
      path: MOCK_REPO.worktree_path,
      branch: "main",
      head: "a1b2c3d"
    }
  ]
};

const DEFAULT_CHANGE_LIST: Changelist = {
  id: DEFAULT_CHANGE_LIST_ID,
  name: "Default",
  created_at: Date.UTC(2026, 1, 10)
};

const FEATURE_CHANGE_LIST: Changelist = {
  id: "feature",
  name: "Feature",
  created_at: Date.UTC(2026, 1, 10, 0, 1)
};

const buildDiffPayload = (
  path: string,
  kind: RepoDiffKind,
  addedLines: number,
  removedLines = 1
): RepoDiffPayload => {
  const normalizedPath = path.replace(/\\/g, "/");
  const fileHeader = `diff --git a/${normalizedPath} b/${normalizedPath}\n--- a/${normalizedPath}\n+++ b/${normalizedPath}`;
  const hunkHeader = `@@ -1,${removedLines} +1,${addedLines} @@`;
  const removals = Array.from({ length: removedLines }, (_, index) => {
    const line = String(index + 1).padStart(3, "0");
    return `-const old_line_${line} = "before-${line}";`;
  });
  const additions = Array.from({ length: addedLines }, (_, index) => {
    const line = String(index + 1).padStart(3, "0");
    return `+const ${kind}_line_${line} = "after-${line}";`;
  });
  const content = [...removals, ...additions].join("\n");
  const patch = `${fileHeader}\n${hunkHeader}\n${content}`;

  return {
    text: patch,
    hunks: [
      {
        path,
        kind,
        id: `${kind}-${path}-hunk-1`,
        header: hunkHeader,
        old_start: 1,
        old_lines: removedLines,
        new_start: 1,
        new_lines: addedLines,
        content,
        content_hash: `${kind}-${path}-hash-1`,
        file_header: fileHeader
      }
    ]
  };
};

const DIFF_PAYLOADS: Record<
  string,
  {
    staged: RepoDiffPayload;
    unstaged: RepoDiffPayload;
  }
> = {
  [SCROLL_FILE_PATH]: {
    staged: { text: "", hunks: [] },
    unstaged: buildDiffPayload(SCROLL_FILE_PATH, "unstaged", 260)
  },
  [MIXED_FILE_PATH]: {
    staged: buildDiffPayload(MIXED_FILE_PATH, "staged", 2),
    unstaged: buildDiffPayload(MIXED_FILE_PATH, "unstaged", 7)
  },
  [UNVERSIONED_FILE_PATH]: {
    staged: { text: "", hunks: [] },
    unstaged: buildDiffPayload(UNVERSIONED_FILE_PATH, "unstaged", 3)
  }
};

type MockState = {
  status: RepoStatus;
  changelists: ChangelistState;
};

const createMockState = (): MockState => {
  const files: StatusFile[] = [
    {
      path: SCROLL_FILE_PATH,
      status: "unstaged"
    },
    {
      path: MIXED_FILE_PATH,
      status: "both"
    },
    {
      path: UNVERSIONED_FILE_PATH,
      status: "untracked"
    }
  ];
  const state: MockState = {
    status: {
      repo_id: REPO_ID,
      head: {
        branch_name: "main",
        oid_short: "a1b2c3d"
      },
      counts: {
        staged: 0,
        unstaged: 0,
        untracked: 0,
        conflicted: 0
      },
      files
    },
    changelists: {
      lists: [DEFAULT_CHANGE_LIST, FEATURE_CHANGE_LIST],
      active_id: FEATURE_CHANGE_LIST.id,
      assignments: {
        [SCROLL_FILE_PATH]: DEFAULT_CHANGE_LIST_ID,
        [MIXED_FILE_PATH]: DEFAULT_CHANGE_LIST_ID,
        [UNVERSIONED_FILE_PATH]: DEFAULT_CHANGE_LIST_ID
      },
      hunk_assignments: {}
    }
  };
  syncStatusFromChangelists(state);
  return state;
};

const syncStatusFromChangelists = (state: MockState) => {
  const listById = new Map(state.changelists.lists.map((item) => [item.id, item]));
  const defaultList = listById.get(DEFAULT_CHANGE_LIST_ID) ?? DEFAULT_CHANGE_LIST;

  for (const file of state.status.files) {
    const assignedId = state.changelists.assignments[file.path] ?? DEFAULT_CHANGE_LIST_ID;
    const assignedList = listById.get(assignedId) ?? defaultList;
    file.changelist_id = assignedList.id;
    file.changelist_name = assignedList.name;
    file.changelist_partial = false;
  }

  state.status.counts = computeCounts(state.status.files);
};

const updateFileStatus = (
  state: MockState,
  path: string,
  transform: (status: StatusFile["status"]) => StatusFile["status"]
) => {
  const file = state.status.files.find((entry) => entry.path === path);
  if (!file) return;
  file.status = transform(file.status);
  syncStatusFromChangelists(state);
};

const applyCommitToPaths = (state: MockState, paths: string[]) => {
  if (paths.length === 0) return;

  state.status.files = state.status.files
    .map((file) => {
      if (!paths.includes(file.path)) return file;
      const next = nextStatusAfterCommit(file.status);
      if (next === null) return null;
      return { ...file, status: next };
    })
    .filter((file): file is StatusFile => file !== null);

  for (const path of paths) {
    const stillDirty = state.status.files.some((file) => file.path === path);
    if (!stillDirty) {
      delete state.changelists.assignments[path];
      delete state.changelists.hunk_assignments[path];
    }
  }

  syncStatusFromChangelists(state);
};

export function installE2ETauriMocks() {
  let runtime = createMockState();
  let nextChangelistSeed = 1;

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
          runtime = createMockState();
          nextChangelistSeed = 1;
          return deepCopy(MOCK_REPO);
        case "repo_open_worktree":
          return {
            ...MOCK_REPO,
            worktree_path:
              typeof req.worktree_path === "string"
                ? req.worktree_path
                : MOCK_REPO.worktree_path
          };
        case "repo_status":
          return deepCopy(runtime.status);
        case "repo_branches":
          return deepCopy(MOCK_BRANCHES);
        case "cl_list":
          return deepCopy(runtime.changelists);
        case "wt_list":
          return deepCopy(MOCK_WORKTREES);
        case "repo_diff_payload": {
          const path = typeof req.path === "string" ? req.path : "";
          const kind: RepoDiffKind = req.kind === "staged" ? "staged" : "unstaged";
          const file = runtime.status.files.find((entry) => entry.path === path);
          if (!file) return { text: "", hunks: [] };
          if (kind === "staged" && !isStagedStatus(file.status)) return { text: "", hunks: [] };
          if (kind === "unstaged" && !isUnstagedStatus(file.status)) return { text: "", hunks: [] };
          const payload = DIFF_PAYLOADS[path]?.[kind];
          return payload ? deepCopy(payload) : { text: "", hunks: [] };
        }
        case "repo_fetch":
          return { remote: "origin", updated: false };
        case "repo_checkout":
          return { head: runtime.status.head };
        case "repo_stage": {
          const path = typeof req.path === "string" ? req.path : "";
          if (path) {
            updateFileStatus(runtime, path, nextStatusAfterStage);
          }
          return null;
        }
        case "repo_track": {
          const path = typeof req.path === "string" ? req.path : "";
          if (path) {
            updateFileStatus(runtime, path, nextStatusAfterTrack);
          }
          return null;
        }
        case "repo_unstage": {
          const path = typeof req.path === "string" ? req.path : "";
          if (path) {
            updateFileStatus(runtime, path, nextStatusAfterUnstage);
          }
          return null;
        }
        case "repo_delete_unversioned": {
          const path = typeof req.path === "string" ? req.path : "";
          if (!path) return null;
          const target = runtime.status.files.find((entry) => entry.path === path);
          if (!target || target.status !== "untracked") {
            throw new Error("Only unversioned files can be deleted.");
          }
          runtime.status.files = runtime.status.files.filter((entry) => entry.path !== path);
          delete runtime.changelists.assignments[path];
          delete runtime.changelists.hunk_assignments[path];
          syncStatusFromChangelists(runtime);
          return null;
        }
        case "commit_staged": {
          const message = typeof req.message === "string" ? req.message.trim() : "";
          const paths = ensureStringArray(req.paths);
          if (!message) {
            throw new Error("Commit message is required.");
          }
          if (paths.length === 0) {
            throw new Error("Select at least one staged file to commit.");
          }
          const stagedPathSet = new Set(
            runtime.status.files
              .filter((file) => isStagedStatus(file.status))
              .map((file) => file.path)
          );
          if (paths.some((path) => !stagedPathSet.has(path))) {
            throw new Error("Some selected files are no longer staged.");
          }
          applyCommitToPaths(runtime, paths);
          return {
            head: {
              branch_name: "main",
              oid_short: "d4e5f6a"
            },
            commit_id: "d4e5f6a7b8c9",
            committed_paths: paths
          };
        }
        case "cl_assign_files": {
          const changelistId =
            typeof req.changelist_id === "string" ? req.changelist_id : DEFAULT_CHANGE_LIST_ID;
          const paths = ensureStringArray(req.paths);
          const isKnownId = runtime.changelists.lists.some((list) => list.id === changelistId);
          const targetId = isKnownId ? changelistId : DEFAULT_CHANGE_LIST_ID;
          for (const path of paths) {
            runtime.changelists.assignments[path] = targetId;
            delete runtime.changelists.hunk_assignments[path];
          }
          syncStatusFromChangelists(runtime);
          return null;
        }
        case "cl_set_active": {
          const id = typeof req.id === "string" ? req.id : "";
          if (runtime.changelists.lists.some((list) => list.id === id)) {
            runtime.changelists.active_id = id;
          }
          return null;
        }
        case "cl_create": {
          const name = typeof req.name === "string" ? req.name.trim() : "";
          const nextName = name || `Mock changelist ${nextChangelistSeed}`;
          const nextList: Changelist = {
            id: `mock-${nextChangelistSeed}`,
            name: nextName,
            created_at: Date.UTC(2026, 1, 10, 0, nextChangelistSeed)
          };
          nextChangelistSeed += 1;
          runtime.changelists.lists.push(nextList);
          return deepCopy(nextList);
        }
        case "cl_rename": {
          const id = typeof req.id === "string" ? req.id : "";
          const name = typeof req.name === "string" ? req.name.trim() : "";
          if (!id || !name) return null;
          const target = runtime.changelists.lists.find((list) => list.id === id);
          if (target) {
            target.name = name;
            syncStatusFromChangelists(runtime);
          }
          return null;
        }
        case "cl_delete": {
          const id = typeof req.id === "string" ? req.id : "";
          if (!id || id === DEFAULT_CHANGE_LIST_ID) return null;
          runtime.changelists.lists = runtime.changelists.lists.filter((list) => list.id !== id);
          if (runtime.changelists.active_id === id) {
            runtime.changelists.active_id = DEFAULT_CHANGE_LIST_ID;
          }
          for (const [path, assignedId] of Object.entries(runtime.changelists.assignments)) {
            if (assignedId === id) {
              delete runtime.changelists.assignments[path];
            }
          }
          for (const [path, assignment] of Object.entries(runtime.changelists.hunk_assignments)) {
            if (assignment.changelist_id === id) {
              delete runtime.changelists.hunk_assignments[path];
            }
          }
          syncStatusFromChangelists(runtime);
          return null;
        }
        case "cl_unassign_files":
        case "cl_assign_hunks":
        case "cl_unassign_hunks":
          return null;
        default:
          return null;
      }
    },
    { shouldMockEvents: true }
  );
}
