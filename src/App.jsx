import { useEffect, useState } from "react";
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
import { SettingsModal } from "./components/SettingsModal.jsx";
import { Sidebar } from "./components/Sidebar.jsx";
import { safeStorageGet, safeStorageSet } from "./lib/utils.js";
import { useReducedMotionPreference } from "./lib/useReducedMotionPreference.js";

function Shell() {
  const { messages, newChat } = useChat();
  const { settings } = useSettings();
  const ready = isReady(settings);
  const reduced = useReducedMotionPreference();
  const [sidebarExpanded, setSidebarExpanded] = useState(() => safeStorageGet("astra.rail.expanded", "0") === "1");
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);
  const hasMessages = messages.length > 0;

  useEffect(() => {
    safeStorageSet("astra.rail.expanded", sidebarExpanded ? "1" : "0");
  }, [sidebarExpanded]);

  function openSearch() {
    setSidebarExpanded(true);
    setSearchFocusSignal((v) => v + 1);
  }

  function startNewChat() {
    newChat();
    setMobileSidebar(false);
  }

  return (
    <LayoutGroup>
      <MotionConfig reducedMotion="user">
      <div className="app">
        <div className="ambient" aria-hidden="true" />
        <div className="app-frame">
          <IconRail
            expanded={sidebarExpanded}
            active={hasMessages ? "history" : "home"}
            onToggle={() => setSidebarExpanded((v) => !v)}
            onNewChat={startNewChat}
            onSearch={openSearch}
            onHistory={() => setSidebarExpanded(true)}
            onSettings={() => setSettingsOpen(true)}
          />

          <AnimatePresence initial={false}>
            {sidebarExpanded && (
              <motion.div className="sidebar-slot desktop-sidebar" layout initial={{ width: 0 }} animate={{ width: 292 }} exit={{ width: 0 }} transition={{ type: "spring", stiffness: 300, damping: 34 }}>
                <Sidebar
                  onOpenSettings={() => setSettingsOpen(true)}
                  onNavigate={() => {}}
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
                <div className="mobile-sidebar-panel">
                  <Sidebar
                    onOpenSettings={() => {
                      setSettingsOpen(true);
                      setMobileSidebar(false);
                    }}
                    onNavigate={() => setMobileSidebar(false)}
                    onCollapse={() => setMobileSidebar(false)}
                    focusSearchSignal={searchFocusSignal}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <main className="main" data-state={hasMessages ? "conversation" : "home"}>
            <button className="mobile-menu" type="button" onClick={() => setMobileSidebar(true)} aria-label="Open sidebar">
              <PanelLeft aria-hidden="true" />
            </button>

            <AnimatePresence mode="wait">
              {hasMessages ? (
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
        <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
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
