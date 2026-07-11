import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from "motion/react";
import { PanelLeft } from "lucide-react";
import { ChatProvider, useChat } from "./context/ChatContext.jsx";
import { SettingsProvider, useSettings } from "./context/SettingsContext.jsx";
import { isReady } from "./agent/runAgent.js";
import { CardGallery } from "./components/CardGallery.jsx";
import { Composer } from "./components/Composer.jsx";
import { Conversation } from "./components/Conversation.jsx";
import { Home, SuggestionChips } from "./components/Home.jsx";
import { IconRail } from "./components/IconRail.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { safeStorageGet, safeStorageSet } from "./lib/utils.js";
import { useReducedMotionPreference } from "./lib/useReducedMotionPreference.js";

// Split the graph engine and settings modal out of the initial chunk: the
// graph only loads when opened, and the modal chunk loads after first paint.
const GraphView = lazy(() =>
  import("./components/GraphView.jsx").then((mod) => ({ default: mod.GraphView }))
);
const SettingsModal = lazy(() =>
  import("./components/SettingsModal.jsx").then((mod) => ({ default: mod.SettingsModal }))
);

function focusableElements(root) {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter((element) => !element.disabled && element.offsetParent !== null);
}

function Shell() {
  const { messages, newChat } = useChat();
  const { settings } = useSettings();
  const ready = isReady(settings);
  const reduced = useReducedMotionPreference();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => safeStorageGet("rovaos.rail.expanded", "0") === "1");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const [activeView, setActiveView] = useState("chat");
  const mobileMenuRef = useRef(null);
  const mobilePanelRef = useRef(null);
  const mobileRestoreRef = useRef(null);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    safeStorageSet("rovaos.rail.expanded", sidebarExpanded ? "1" : "0");
  }, [sidebarExpanded]);

  useEffect(() => {
    if (!mobileSidebar) return undefined;
    mobileRestoreRef.current = document.activeElement;
    const focusTimer = window.setTimeout(() => {
      const first = focusableElements(mobilePanelRef.current)[0];
      (first || mobilePanelRef.current)?.focus();
    }, 0);

    function onKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileSidebar(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableElements(mobilePanelRef.current);
      if (!focusable.length) {
        event.preventDefault();
        mobilePanelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !mobilePanelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !mobilePanelRef.current?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      const restore = mobileRestoreRef.current || mobileMenuRef.current;
      if (restore && typeof restore.focus === "function" && document.contains(restore)) restore.focus();
    };
  }, [mobileSidebar]);

  function openSearch() {
    setActiveView("chat");
    setSidebarExpanded(true);
    setSearchFocusSignal((v) => v + 1);
  }

  function startNewChat() {
    setActiveView("chat");
    newChat();
    setMobileSidebar(false);
  }

  function openHistory() {
    setActiveView("chat");
    setSidebarExpanded(true);
  }

  function openGraph() {
    setActiveView("graph");
    setSidebarExpanded(false);
    setMobileSidebar(false);
  }

  function returnToChat() {
    setActiveView("chat");
  }

  return (
    <LayoutGroup>
      <MotionConfig reducedMotion="user">
      <div className="app">
        <div className="ambient" aria-hidden="true" />
        <div className="app-frame" inert={settingsOpen ? true : undefined} aria-hidden={settingsOpen ? "true" : undefined}>
          <IconRail
            expanded={sidebarExpanded}
            active={activeView === "graph" ? "graph" : hasMessages ? "history" : "home"}
            onToggle={() => setSidebarExpanded((v) => !v)}
            onNewChat={startNewChat}
            onSearch={openSearch}
            onHistory={openHistory}
            onGraph={openGraph}
            onSettings={() => setSettingsOpen(true)}
          />

          <AnimatePresence initial={false}>
            {sidebarExpanded && (
              <motion.div className="sidebar-slot desktop-sidebar" layout initial={{ width: 0 }} animate={{ width: 292 }} exit={{ width: 0 }} transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 300, damping: 34 }}>
                <Sidebar
                  onOpenSettings={() => setSettingsOpen(true)}
                  onNavigate={returnToChat}
                  onGraph={openGraph}
                  onCollapse={() => setSidebarExpanded(false)}
                  focusSearchSignal={searchFocusSignal}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {mobileSidebar && (
              <motion.div className="mobile-sidebar-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <button className="mobile-scrim" type="button" aria-label="Close sidebar" onClick={() => setMobileSidebar(false)} />
                <div
                  className="mobile-sidebar-panel"
                  id="mobile-sidebar-dialog"
                  ref={mobilePanelRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Navigation and conversations"
                  tabIndex={-1}
                >
                  <Sidebar
                    onOpenSettings={() => {
                      setSettingsOpen(true);
                      setMobileSidebar(false);
                    }}
                    onNavigate={() => {
                      returnToChat();
                      setMobileSidebar(false);
                    }}
                    onGraph={openGraph}
                    onCollapse={() => setMobileSidebar(false)}
                    focusSearchSignal={searchFocusSignal}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <main
            className="main"
            data-state={activeView === "graph" ? "graph" : hasMessages ? "conversation" : "home"}
            inert={mobileSidebar ? true : undefined}
            aria-hidden={mobileSidebar ? "true" : undefined}
          >
            <button
              className="mobile-menu"
              ref={mobileMenuRef}
              type="button"
              onClick={() => setMobileSidebar(true)}
              aria-label="Open sidebar"
              aria-controls="mobile-sidebar-dialog"
              aria-expanded={mobileSidebar}
            >
              <PanelLeft aria-hidden="true" />
            </button>

            <AnimatePresence mode="wait">
              {activeView === "graph" ? (
                <motion.div
                  key="graph"
                  className="screen graph-screen"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.08 : 0.22 }}
                >
                  <Suspense fallback={<div className="screen-loading" role="status">Loading graph…</div>}>
                    <GraphView />
                  </Suspense>
                </motion.div>
              ) : hasMessages ? (
                <motion.div
                  key="conversation"
                  className="screen conversation-screen"
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.035 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                  transition={{ duration: reduced ? 0.12 : 0.34, ease: [0.2, 0.8, 0.2, 1] }}
                >
                  <Conversation />
                  <div className="docked-composer">
                    <SuggestionChips compact />
                    <Composer disabled={!ready} onDisabledClick={() => setSettingsOpen(true)} placement="docked" />
                  </div>
                </motion.div>
              ) : (
                <Home
                  key="home"
                  disabled={!ready}
                  onDisabledClick={() => setSettingsOpen(true)}
                />
              )}
            </AnimatePresence>
          </main>
        </div>
        <Suspense fallback={null}>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </Suspense>
      </div>
      </MotionConfig>
    </LayoutGroup>
  );
}

export default function App() {
  if (new URLSearchParams(window.location.search).has("gallery")) return <CardGallery />;
  return (
    <SettingsProvider>
      <ChatProvider>
        <Shell />
      </ChatProvider>
    </SettingsProvider>
  );
}
