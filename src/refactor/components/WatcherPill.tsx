import { CircleDot } from "lucide-react";
import { Button } from "./ui/button";

export type WatcherStatus = "connecting" | "active" | "degraded" | "offline";

interface WatcherPillProps {
  status: WatcherStatus;
  busy: boolean;
  onRefresh: () => void;
}

const WATCHER_META: Record<WatcherStatus, { label: string; border: string; text: string; dot: string; hover: string; title: string }> = {
  connecting: {
    label: "Watcher Connecting",
    border: "border-[#8a7446]",
    text: "text-[#d3b985]",
    dot: "text-[#d3b985]",
    hover: "hover:bg-[#5b4d32]",
    title: "Watcher is connecting. Click to refresh now."
  },
  active: {
    label: "Watcher On",
    border: "border-[#3f8f4f]",
    text: "text-[#9ad38f]",
    dot: "text-[#59d96b]",
    hover: "hover:bg-[#2f5f38]",
    title: "Watcher is active. Click to refresh now."
  },
  degraded: {
    label: "Watcher Degraded",
    border: "border-[#8a7446]",
    text: "text-[#d3b985]",
    dot: "text-[#d3b985]",
    hover: "hover:bg-[#5b4d32]",
    title: "Watcher is degraded. Click to refresh now."
  },
  offline: {
    label: "Watcher Offline",
    border: "border-[#8a4d4d]",
    text: "text-[#d89a9a]",
    dot: "text-[#d97575]",
    hover: "hover:bg-[#5f3535]",
    title: "Watcher is offline. Click to refresh now."
  }
};

export function WatcherPill({ status, busy, onRefresh }: WatcherPillProps) {
  const meta = WATCHER_META[status];
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onRefresh}
      disabled={busy}
      className={`h-7 px-2.5 gap-1.5 text-xs border ${meta.border} ${meta.text} ${meta.hover} disabled:opacity-60`}
      title={meta.title}
    >
      <CircleDot className={`size-3.5 ${meta.dot} ${busy ? "animate-pulse" : ""}`} />
      <span>{busy ? "Refreshing..." : meta.label}</span>
    </Button>
  );
}
