import { create } from "zustand";
import type { RepoListItem, RepoStatus, RepoSummary } from "../types/ipc";

interface AppState {
  repo?: RepoSummary;
  status?: RepoStatus;
  recent: RepoListItem[];
  setRepo: (repo?: RepoSummary) => void;
  setStatus: (status?: RepoStatus) => void;
  setRecent: (recent: RepoListItem[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  recent: [],
  setRepo: (repo) => set({ repo }),
  setStatus: (status) => set({ status }),
  setRecent: (recent) => set({ recent })
}));
