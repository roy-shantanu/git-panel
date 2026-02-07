import { Button } from "./ui/button";
import type { RepoListItem } from "../../types/ipc";

interface WelcomePageProps {
  recent: RepoListItem[];
  repoBusy: boolean;
  onOpenRepo: () => void;
  onSelectRecentRepo: (path: string) => void;
}

export function WelcomePage({
  recent,
  repoBusy,
  onOpenRepo,
  onSelectRecentRepo
}: WelcomePageProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl rounded-xl border border-[#323232] bg-[#3c3f41] p-8">
        <h1 className="text-2xl text-[#bbbbbb] mb-2">Open a repository</h1>
        <p className="text-sm text-[#787878] mb-6">
          Start by opening a local Git repository, or choose one from recent.
        </p>
        <Button
          onClick={onOpenRepo}
          disabled={repoBusy}
          className="bg-[#4e5254] hover:bg-[#5a5f63] text-[#bbbbbb] mb-6"
        >
          {repoBusy ? "Opening..." : "Open Repository"}
        </Button>

        <div className="border-t border-[#323232] pt-4">
          <h2 className="text-sm text-[#bbbbbb] mb-3">Recent Repositories</h2>
          {recent.length === 0 ? (
            <p className="text-xs text-[#787878]">No recent repositories found.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((item) => (
                <button
                  key={item.repo_id}
                  onClick={() => onSelectRecentRepo(item.path)}
                  className="w-full text-left rounded-md border border-[#323232] bg-[#2f3133] px-3 py-2 hover:bg-[#4e5254]"
                >
                  <div className="text-sm text-[#bbbbbb]">{item.name}</div>
                  <div className="text-xs text-[#787878] truncate">{item.path}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
