import { Marked } from 'marked';
import hljs from 'highlight.js/lib/common';

const marked = new Marked({ gfm: true, breaks: false });

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }): string {
      const language = lang && hljs.getLanguage(lang) ? lang : null;
      const html = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value;
      const cls = language ? `hljs language-${language}` : 'hljs';
      return `<pre><code class="${cls}">${html}</code></pre>\n`;
    },
  },
});

export function renderMarkdown(md: string): string {
  return marked.parse(md) as string;
}