import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './markdown.css';
import { prepareMarkdown } from '../../lib/markdownText.js';

// Hoisted so a re-render while streaming does not rebuild the plugin chain.
const REMARK_PLUGINS = [remarkGfm, remarkMath];
// A half-streamed formula renders as plain text instead of throwing.
const REHYPE_PLUGINS = [[rehypeKatex, { throwOnError: false, strict: 'ignore' }]];

const COMPONENTS = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
  table: ({ node: _node, ...props }) => (
    <div className="md-table">
      <table {...props} />
    </div>
  ),
};

/**
 * Renders a model's answer: GitHub-flavoured Markdown plus KaTeX math. Raw HTML in
 * the answer is not rendered (react-markdown's default), so a model cannot inject
 * markup into the dashboard.
 */
export default function Markdown({ text }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={COMPONENTS}
      >
        {prepareMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}
