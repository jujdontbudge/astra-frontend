import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ChevronLeft,
  ChevronsLeft,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  UserRound,
  Waypoints,
} from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { springs } from "../lib/motion.js";
import { cn } from "../lib/utils.js";

export function Sidebar({ onOpenSettings, onNavigate, onGraph, onCollapse, focusSearchSignal = 0 }) {
  const { conversations, activeId, newChat, selectChat, deleteChat, renameChat } = useChat();
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const searchRef = useRef(null);

  useEffect(() => {
    if (focusSearchSignal) searchRef.current?.focus();
  }, [focusSearchSignal]);

  const filtered = conversations.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()));

  function startRename(conv) {
    setEditingId(conv.id);
    setDraft(conv.title);
  }

  function commitRename() {
    if (editingId) renameChat(editingId, draft);
    setEditingId(null);
    setDraft("");
  }

  function handleNew() {
    newChat();
    onNavigate?.();
  }

  function handleSelect(id) {
    selectChat(id);
    onNavigate?.();
  }

  return (
    <motion.aside className="sidebar" aria-label="Conversations" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={springs.panel}>
      <div className="brand">
        <span className="brand-mark">A</span>
        <span className="brand-name">RovaOS</span>
        <button className="sidebar-collapse" type="button" onClick={onCollapse} aria-label="Collapse sidebar">
          <ChevronsLeft aria-hidden="true" />
        </button>
      </div>

      <button className="new-chat" type="button" onClick={handleNew}>
        <Plus aria-hidden="true" />
        <span>New chat</span>
      </button>

      <button className="new-chat sidebar-graph" type="button" onClick={onGraph}>
        <Waypoints aria-hidden="true" />
        <span>Graph view</span>
      </button>

      <div className="thread-search">
        <Search aria-hidden="true" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats"
          aria-label="Search chats"
          data-testid="sidebar-search"
        />
      </div>

      <nav className="thread-list" aria-label="Chat history">
        {filtered.length === 0 && <p className="thread-empty">{conversations.length ? "No matches" : "No chats yet"}</p>}
        {filtered.map((conv) => (
          <motion.div className={cn("thread", conv.id === activeId && "active")} key={conv.id} layout>
            {editingId === conv.id ? (
              <input
                className="thread-rename"
                value={draft}
                autoFocus
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setEditingId(null);
                    setDraft("");
                  }
                }}
                data-testid="rename-input"
              />
            ) : (
              <>
                <button
                  className="thread-open"
                  type="button"
                  onClick={() => handleSelect(conv.id)}
                  onDoubleClick={() => startRename(conv)}
                  title={conv.title}
                >
                  <MessageSquare aria-hidden="true" />
                  <span className="thread-title">{conv.title}</span>
                </button>
                <button
                  className="thread-del"
                  type="button"
                  aria-label={`Delete ${conv.title}`}
                  onClick={() => deleteChat(conv.id)}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </>
            )}
          </motion.div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <button className="account-row" type="button" onClick={onOpenSettings}>
          <span className="avatar">
            <UserRound aria-hidden="true" />
          </span>
          <span>
            <strong>Rohan</strong>
            <small>RovaOS operator</small>
          </span>
          <ChevronLeft className="account-chevron" aria-hidden="true" />
        </button>
        <button className="foot-btn" type="button" onClick={onOpenSettings}>
          <Settings aria-hidden="true" />
          <span>Settings</span>
        </button>
      </div>
    </motion.aside>
  );
}
