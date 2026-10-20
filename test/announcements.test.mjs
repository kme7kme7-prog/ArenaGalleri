import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderAnnouncementMarkdown } from '../site/announcement-markdown.js';

test('announcement Markdown renders common blocks without running raw HTML or unsafe links', () => {
  const html = renderAnnouncementMarkdown(`# 标题

**加粗**和[站内链接](#/questions)，[危险链接](javascript:alert(1))

- 第一项
- 第二项

| 名称 | 值 |
| --- | --- |
| A | B |

\`\`\`html
<script>alert(1)</script>
\`\`\``);
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<strong>加粗<\/strong>/);
  assert.match(html, /href="#\/questions"/);
  assert.doesNotMatch(html, /href="javascript:/);
  assert.match(html, /<ul><li>第一项<\/li><li>第二项<\/li><\/ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
