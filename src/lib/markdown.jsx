import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function safeUri(uri) {
  return /^(https?:|mailto:)/i.test(uri) ? uri : "";
}

const components = {
  // Wide tables scroll inside their own container instead of crushing
  // columns into vertical slivers on narrow screens.
  table: (props) => (
    <div className="md-table-wrap">
      <table {...props} />
    </div>
  ),
};

export function Markdown({ text }) {
  if (!text) return null;
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={safeUri} components={components}>
        {String(text)}
      </ReactMarkdown>
    </div>
  );
}
