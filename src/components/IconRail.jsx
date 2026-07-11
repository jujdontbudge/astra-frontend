import { History, PanelLeft, Plus, Search, Settings, Sparkles, Waypoints } from "lucide-react";
import { cn } from "../lib/utils.js";

function RailButton({ label, icon: Icon, active, onClick, className }) {
  return (
    <button className={cn("rail-btn", active && "active", className)} type="button" onClick={onClick} aria-label={label} aria-current={active ? "page" : undefined}>
      <Icon aria-hidden="true" />
      <span className="tooltip">{label}</span>
    </button>
  );
}

export function IconRail({ expanded, onToggle, onNewChat, onSearch, onHistory, onGraph, onSettings, active = "home" }) {
  return (
    <aside className="icon-rail" aria-label="Primary navigation">
      <button className={cn("rail-logo", expanded && "active")} type="button" onClick={onToggle} aria-label="Toggle sidebar">
        <PanelLeft aria-hidden="true" />
      </button>
      <nav className="rail-nav">
        <RailButton label="New chat" icon={Plus} active={active === "home"} onClick={onNewChat} />
        <RailButton label="Search" icon={Search} onClick={onSearch} />
        <RailButton label="Chats" icon={History} active={active === "history"} onClick={onHistory} />
        <RailButton label="Graph" icon={Waypoints} active={active === "graph"} onClick={onGraph} />
        <RailButton label="Preview" icon={Sparkles} onClick={onSettings} />
      </nav>
      <RailButton label="Settings" icon={Settings} onClick={onSettings} className="rail-bottom" />
    </aside>
  );
}
