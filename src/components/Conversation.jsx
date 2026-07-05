import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { useChat } from "../context/ChatContext.jsx";
import { Message } from "./Message.jsx";

export function Conversation() {
  const { messages, activeId, isStreaming } = useChat();
  const flowRef = useRef(null);
  const innerRef = useRef(null);
  const nearBottom = useRef(true);
  const lastMessageState = useRef({ activeId: null, count: 0, lastId: null });
  const [showJump, setShowJump] = useState(false);

  function scrollToBottom(behavior = "smooth") {
    const el = flowRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    nearBottom.current = true;
    setShowJump(false);
  }

  useLayoutEffect(() => {
    const lastId = messages.at(-1)?.id || null;
    const previous = lastMessageState.current;
    const switchedConversation = previous.activeId !== activeId;
    const addedMessage = !switchedConversation && (messages.length > previous.count || lastId !== previous.lastId);
    lastMessageState.current = { activeId, count: messages.length, lastId };

    if (switchedConversation || addedMessage || nearBottom.current) {
      const behavior = switchedConversation ? "auto" : "smooth";
      scrollToBottom(behavior);
      requestAnimationFrame(() => scrollToBottom(behavior));
    } else {
      setShowJump(true);
    }
  }, [activeId, messages]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const el = flowRef.current;
      if (!el) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 220) scrollToBottom("auto");
    });
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  return (
    <section className="conversation" aria-label="Conversation">
      <div
        className="flow"
        ref={flowRef}
        onScroll={(event) => {
          const el = event.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
          if (nearBottom.current) setShowJump(false);
        }}
      >
        <div className="flow-inner" ref={innerRef}>
          {messages.map((message) => (
            <Message message={message} key={message.id} />
          ))}
        </div>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {isStreaming ? "Astra is responding…" : ""}
      </div>
      {showJump && (
        <button className="jump-latest" type="button" onClick={() => scrollToBottom("smooth")}>
          <ArrowDown aria-hidden="true" />
          <span>Latest</span>
        </button>
      )}
    </section>
  );
}
