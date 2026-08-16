// markdown.ts — small wrapper around `marked` for rendering authored poem
// text (and, eventually, user-submitted zine text through the same path).
//
// HTML metacharacters are escaped before parsing, so a raw <tag> in the
// source can never reach the DOM as anything but literal text — this
// closes the hole the zine feature would otherwise open later. Leading
// whitespace on a line is converted to literal &nbsp; runs before parsing:
// poems use deliberate internal indentation, and 4+ literal leading spaces
// would otherwise read to the parser as an indented code block.

import { marked } from 'marked';

marked.use({ breaks: true });

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function preserveLeadingWhitespace(text: string): string {
  return text.replace(/^[ \t]+/gm, (run) => '&nbsp;'.repeat(run.length));
}

export function renderMarkdown(text: string): string {
  return marked.parse(preserveLeadingWhitespace(escapeHtml(text))) as string;
}
