// Split SQL into top-level statements, the way Postgres reads them: comments
// dropped, quoted strings kept, dollar-quoted bodies kept exactly.
// Each statement: { head } (text outside bodies, whitespace collapsed, lower case),
// { key } (head plus bodies), { hash } (md5 of key).
import { createHash } from 'node:crypto';

const md5 = (s) => createHash('md5').update(s).digest('hex');

export function splitSql(src) {
  const out = [];
  let cur = '';
  let bodies = [];
  const n = src.length;
  for (let i = 0; i < n; ) {
    const c = src[i];
    if (c === '-' && src[i + 1] === '-') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? n : j;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const j = src.indexOf('*/', i + 2);
      i = j < 0 ? n : j + 2;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      cur += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i, i + 64));
      if (m) {
        const tag = m[0];
        let j = src.indexOf(tag, i + tag.length);
        if (j < 0) j = n;
        bodies.push(src.slice(i + tag.length, j));
        cur += ' $BODY$ ';
        i = j + tag.length;
        continue;
      }
    }
    if (c === ';') {
      if (cur.trim()) out.push({ text: cur, bodies });
      cur = '';
      bodies = [];
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push({ text: cur, bodies });
  return out.map(({ text, bodies }) => {
    const head = text.replace(/\s+/g, ' ').trim().toLowerCase();
    const key = head + '|' + bodies.map((b) => b.replace(/\s+/g, ' ').trim()).join('|');
    return { head, key, hash: md5(key) };
  });
}
