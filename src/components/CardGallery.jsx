import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { ErrorNote, CalendarCard, EmailCard, ToolChip } from "./AgentBlocks.jsx";
import { galleryBlocks } from "../lib/tooling.js";

function GalleryItem({ title, children }) {
  const [version, setVersion] = useState(0);
  return (
    <section className="gallery-item">
      <div className="gallery-item-head">
        <h2>{title}</h2>
        <button type="button" onClick={() => setVersion((v) => v + 1)}>
          <RotateCcw aria-hidden="true" />
          Replay
        </button>
      </div>
      <div className="gallery-stage" key={version}>
        {children}
      </div>
    </section>
  );
}

export function CardGallery() {
  return (
    <main className="gallery-page" data-testid="gallery-page">
      <header className="gallery-hero">
        <span className="brand-mark">A</span>
        <div>
          <h1>Astra card gallery</h1>
          <p>Motion and state harness for confirmation cards and tool chips.</p>
        </div>
      </header>
      <div className="gallery-grid">
        <GalleryItem title="Calendar with attendees">
          <CalendarCard block={galleryBlocks.calendar} />
        </GalleryItem>
        <GalleryItem title="Calendar without attendees">
          <CalendarCard block={galleryBlocks.calendarSolo} />
        </GalleryItem>
        <GalleryItem title="Calendar error">
          <CalendarCard block={galleryBlocks.calendarError} />
        </GalleryItem>
        <GalleryItem title="Email sent">
          <EmailCard block={galleryBlocks.email} />
        </GalleryItem>
        <GalleryItem title="Email high importance">
          <EmailCard block={galleryBlocks.emailHigh} />
        </GalleryItem>
        <GalleryItem title="Email error">
          <EmailCard block={galleryBlocks.emailError} />
        </GalleryItem>
        <GalleryItem title="Tool running">
          <ToolChip block={galleryBlocks.toolRunning} />
        </GalleryItem>
        <GalleryItem title="Tool done">
          <ToolChip block={galleryBlocks.toolDone} />
        </GalleryItem>
        <GalleryItem title="Tool error">
          <ToolChip block={galleryBlocks.toolError} />
        </GalleryItem>
        <GalleryItem title="Error note">
          <ErrorNote message="The backend closed the connection before replying." />
        </GalleryItem>
      </div>
    </main>
  );
}
