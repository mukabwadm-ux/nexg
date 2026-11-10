/**
 * A small syntax highlighter for the code in the docs.
 *
 * Five languages are enough here (JSON, shell, JavaScript, Python and raw
 * HTTP), and a tokenizer this size costs nothing at runtime and nothing in
 * dependencies. It never builds HTML strings: callers render the tokens as
 * React elements, so a sample can never inject markup.
 */

export type Language = 'json' | 'curl' | 'shell' | 'javascript' | 'python' | 'http' | 'text';

export type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'key'
  | 'number'
  | 'literal'
  | 'keyword'
  | 'variable'
  | 'punctuation';

export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS: Partial<Record<Language, Set<string>>> = {
  javascript: new Set([
    'async',
    'await',
    'catch',
    'const',
    'else',
    'export',
    'for',
    'from',
    'function',
    'if',
    'import',
    'let',
    'new',
    'of',
    'return',
    'throw',
    'try',
  ]),
  python: new Set([
    'as',
    'def',
    'elif',
    'else',
    'except',
    'for',
    'from',
    'if',
    'import',
    'in',
    'not',
    'or',
    'and',
    'raise',
    'return',
    'try',
    'with',
  ]),
  curl: new Set(['curl', 'export', 'pnpm', 'docker', 'openssl', 'printf', 'sed', 'date']),
  shell: new Set(['curl', 'export', 'pnpm', 'docker', 'openssl', 'printf', 'sed', 'date']),
};

const LITERALS: Partial<Record<Language, Set<string>>> = {
  json: new Set(['true', 'false', 'null']),
  javascript: new Set(['true', 'false', 'null', 'undefined']),
  python: new Set(['True', 'False', 'None']),
};

function commentStart(language: Language, code: string, i: number): boolean {
  const c = code[i];
  if (language === 'javascript') return c === '/' && code[i + 1] === '/';
  if (language === 'python' || language === 'curl' || language === 'shell') {
    // A # only opens a comment at the start of a word, not inside a URL.
    return c === '#' && (i === 0 || /\s/.test(code[i - 1] ?? ''));
  }
  if (language === 'http') return false;
  return false;
}

function push(tokens: Token[], kind: TokenKind, text: string) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.kind === kind) last.text += text;
  else tokens.push({ kind, text });
}

/** Split code into tokens. Joining every token's text gives back the input. */
export function tokenize(code: string, language: Language): Token[] {
  const tokens: Token[] = [];
  if (language === 'text') return [{ kind: 'plain', text: code }];

  let i = 0;
  while (i < code.length) {
    const c = code[i] ?? '';

    if (commentStart(language, code, i)) {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      push(tokens, 'comment', code.slice(i, stop));
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || (c === '`' && language === 'javascript')) {
      let j = i + 1;
      while (j < code.length && code[j] !== c) {
        if (code[j] === '\\') j += 1;
        // An unclosed shell quote must not swallow the rest of the sample.
        if (code[j] === '\n' && c !== '`' && language !== 'curl' && language !== 'shell') break;
        j += 1;
      }
      const text = code.slice(i, Math.min(j + 1, code.length));
      const rest = code.slice(i + text.length);
      const isKey = language === 'json' && /^\s*:/.test(rest);
      push(tokens, isKey ? 'key' : 'string', text);
      i += text.length;
      continue;
    }

    if ((language === 'curl' || language === 'shell') && c === '$') {
      const match = /^\$(\{[^}]*\}|\(|[A-Za-z_][A-Za-z0-9_]*)/.exec(code.slice(i));
      if (match) {
        push(tokens, 'variable', match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (
      (language === 'curl' || language === 'shell') &&
      c === '-' &&
      /\s/.test(code[i - 1] ?? ' ')
    ) {
      const match = /^--?[A-Za-z][A-Za-z-]*/.exec(code.slice(i));
      if (match) {
        push(tokens, 'keyword', match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (language === 'http' && (i === 0 || code[i - 1] === '\n')) {
      const header = /^[A-Za-z][A-Za-z0-9-]*(?=:)/.exec(code.slice(i));
      if (header) {
        push(tokens, 'key', header[0]);
        i += header[0].length;
        continue;
      }
    }

    const negative = c === '-' && language === 'json' && /[0-9]/.test(code[i + 1] ?? '');
    if ((/[0-9]/.test(c) || negative) && !/[A-Za-z_]/.test(code[i - 1] ?? '')) {
      const match = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(code.slice(i));
      if (match) {
        push(tokens, 'number', match[0]);
        i += match[0].length;
        continue;
      }
    }

    if (/[A-Za-z_]/.test(c)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(code.slice(i));
      const word = match?.[0] ?? c;
      if (LITERALS[language]?.has(word)) push(tokens, 'literal', word);
      else if (KEYWORDS[language]?.has(word)) push(tokens, 'keyword', word);
      else if (language === 'http' && /^(GET|POST|PATCH|PUT|DELETE)$/.test(word)) {
        push(tokens, 'keyword', word);
      } else push(tokens, 'plain', word);
      i += word.length;
      continue;
    }

    if (/[{}[\](),:;]/.test(c)) {
      push(tokens, 'punctuation', c);
      i += 1;
      continue;
    }

    push(tokens, 'plain', c);
    i += 1;
  }
  return tokens;
}
