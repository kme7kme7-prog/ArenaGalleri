// Render announcement Markdown with a small, escaped tag set. Raw HTML stays text.
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeLink = url => /^(https:\/\/|#\/|mailto:)/i.test(url);

function inline(source) {
  const pattern = /(`+)([^`\n]+)\1|!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\n]+)\*|(?<![\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu;
  let html = '', offset = 0;
  for (const match of source.matchAll(pattern)) {
    html += esc(source.slice(offset, match.index));
    if (match[2] !== undefined) html += `<code>${esc(match[2])}</code>`;
    else if (match[4] !== undefined) html += /^https:\/\//i.test(match[4])
      ? `<img src="${esc(match[4])}" alt="${esc(match[3])}" loading="lazy">` : esc(match[0]);
    else if (match[6] !== undefined) html += safeLink(match[6])
      ? `<a href="${esc(match[6])}"${/^https:\/\//i.test(match[6]) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${esc(match[5])}</a>` : esc(match[0]);
    else if (match[7] !== undefined || match[8] !== undefined) html += `<strong>${inline(match[7] ?? match[8])}</strong>`;
    else html += `<em>${inline(match[9] ?? match[10])}</em>`;
    offset = match.index + match[0].length;
  }
  return html + esc(source.slice(offset));
}

const cells = row => row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|'));
const DIVIDER = /^ {0,3}\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;

export function renderAnnouncementMarkdown(source) {
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n');
  const output = [];
  const special = line => /^(?: {0,3}(?:#{1,6}\s|`{3,}|~{3,}|>|[-+*]\s|\d+[.)]\s)|\s*(?:\*\s*){3,}$|\s*(?:-\s*){3,}$|\s*(?:_\s*){3,}$)/.test(line);
  const tableAt = i => i + 1 < lines.length && lines[i].includes('|') && lines[i + 1].includes('|') && DIVIDER.test(lines[i + 1])
    && cells(lines[i]).length === cells(lines[i + 1]).length;
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = line.match(/^ {0,3}(`{3,}|~{3,})[^\n]*$/);
    if (fence) {
      const body = [], closing = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}\\s*$`);
      i++;
      while (i < lines.length && !closing.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      output.push(`<pre><code>${esc(body.join('\n'))}</code></pre>`);
      continue;
    }
    if (tableAt(i)) {
      const head = cells(line), rows = [];
      for (i += 2; i < lines.length && lines[i].trim() && lines[i].includes('|'); i++) {
        const row = cells(lines[i]);
        rows.push(`<tr>${head.map((_, k) => `<td>${inline(row[k] ?? '')}</td>`).join('')}</tr>`);
      }
      output.push(`<div class="announcement-table"><table><thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead>${rows.length ? `<tbody>${rows.join('')}</tbody>` : ''}</table></div>`);
      continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) { output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); i++; continue; }
    if (/^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/.test(line)) { output.push('<hr>'); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const body = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) body.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      output.push(`<blockquote><p>${body.map(inline).join('<br>')}</p></blockquote>`);
      continue;
    }
    const list = line.match(/^ {0,3}([-+*]|\d+[.)])\s+(.+)$/);
    if (list) {
      const ordered = /^\d/.test(list[1]), pattern = ordered ? /^ {0,3}\d+[.)]\s+(.+)$/ : /^ {0,3}[-+*]\s+(.+)$/;
      const items = [];
      let item;
      while (i < lines.length && (item = lines[i].match(pattern))) { items.push(`<li>${inline(item[1])}</li>`); i++; }
      const tag = ordered ? 'ol' : 'ul';
      output.push(`<${tag}>${items.join('')}</${tag}>`);
      continue;
    }
    const body = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !special(lines[i]) && !tableAt(i)) body.push(lines[i++]);
    output.push(`<p>${body.map(inline).join('<br>')}</p>`);
  }
  return output.join('');
}
