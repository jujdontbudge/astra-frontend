import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUri(uri) {
  return /^(https?:|mailto:)/i.test(uri) ? uri : "";
}

export function Markdown({ text }) {
  if (!text) return null;
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUri}>
        {String(text)}
      </ReactMarkdown>
    </div>
  );
}
