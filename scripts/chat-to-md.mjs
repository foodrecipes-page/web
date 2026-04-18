import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('chat.json', 'utf8'));

function extractText(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg.text === 'string' && msg.text.length) return msg.text;
  if (Array.isArray(msg.parts)) {
    return msg.parts.map(p => {
      if (typeof p === 'string') return p;
      if (typeof p.text === 'string') return p.text;
      if (p.value) return typeof p.value === 'string' ? p.value : '';
      return '';
    }).join('');
  }
  if (Array.isArray(msg)) {
    return msg.map(extractText).join('\n');
  }
  return '';
}

function extractResponse(response) {
  if (!response) return '';
  const parts = Array.isArray(response) ? response : (response.value || response.parts || []);
  const chunks = [];
  const arr = Array.isArray(parts) ? parts : [];
  for (const p of arr) {
    if (!p) continue;
    if (typeof p === 'string') { chunks.push(p); continue; }
    const kind = p.kind;
    if (typeof p.value === 'string') chunks.push(p.value);
    else if (typeof p.text === 'string') chunks.push(p.text);
    else if (kind === 'codeblockUri' && p.uri) { /* skip */ }
    else if (p.content) chunks.push(extractResponse(p.content));
  }
  return chunks.join('');
}

const lines = [];
lines.push('# Chat Transcript');
lines.push('');
lines.push(`_Responder: ${data.responderUsername || 'Assistant'}_`);
lines.push('');

data.requests.forEach((req, i) => {
  lines.push(`---`);
  lines.push('');
  lines.push(`## Turn ${i + 1}`);
  lines.push('');
  lines.push(`### User`);
  lines.push('');
  lines.push(extractText(req.message).trim());
  lines.push('');
  lines.push(`### ${data.responderUsername || 'Assistant'}`);
  lines.push('');
  const resp = extractResponse(req.response) || extractText(req.response);
  lines.push(resp.trim() || '_(no response captured)_');
  lines.push('');
});

fs.writeFileSync('chat.md', lines.join('\n'));
console.log('Wrote chat.md with', data.requests.length, 'turns');
