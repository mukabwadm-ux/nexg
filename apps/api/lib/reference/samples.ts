import { HOSTS, type CodeSample, type EndpointDoc } from './types';

/**
 * Request samples, written from the registry entry so every endpoint gets
 * the same three, in the same style, with the same placeholders.
 *
 * Keys come from an environment variable (`NEXG_API_KEY`) in every sample.
 * A key pasted into a command ends up in shell history, and a key pasted
 * into source ends up in a repository. Where the key is optional (public
 * reads), every sample still works with the variable unset: curl drops a
 * header whose value is empty, and the JavaScript and Python samples leave
 * the header out.
 */

type Sampled = Pick<
  EndpointDoc,
  'method' | 'host' | 'path' | 'auth' | 'example' | 'samples' | 'responseExample'
>;

function resolvedPath(endpoint: Sampled): string {
  return endpoint.path.replace(
    /\{(\w+)\}/g,
    (_, name: string) => endpoint.example.path?.[name] ?? `{${name}}`,
  );
}

function queryString(query: Record<string, string> | undefined): string {
  if (!query || Object.keys(query).length === 0) return '';
  return `?${new URLSearchParams(query).toString()}`;
}

function sendsKey(endpoint: Sampled): boolean {
  return endpoint.auth.kind === 'key' || endpoint.auth.kind === 'optional_key';
}

function keyOptional(endpoint: Sampled): boolean {
  return endpoint.auth.kind === 'optional_key';
}

function json(value: unknown, indent: number, step = 2): string {
  const pad = ' '.repeat(indent);
  return JSON.stringify(value, null, step)
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n');
}

function curl(endpoint: Sampled): string {
  const url = `${HOSTS[endpoint.host]}${resolvedPath(endpoint)}${queryString(endpoint.example.query)}`;
  const lines = [
    endpoint.method === 'GET' ? `curl "${url}"` : `curl -X ${endpoint.method} "${url}"`,
  ];
  if (sendsKey(endpoint)) lines.push(`-H "X-Api-Key: $NEXG_API_KEY"`);
  for (const [name, value] of Object.entries(endpoint.example.headers ?? {})) {
    lines.push(`-H "${name}: ${value}"`);
  }
  if (endpoint.example.body !== undefined) {
    lines.push(`-H "Content-Type: application/json"`);
    lines.push(`--data '${JSON.stringify(endpoint.example.body)}'`);
  }
  return lines.join(' \\\n  ');
}

/** Lists and reads answer in `data`; the planned booking receipt is flat. */
function hasDataEnvelope(endpoint: Sampled): boolean {
  const example = endpoint.responseExample;
  return typeof example === 'object' && example !== null && 'data' in example;
}

function javascript(endpoint: Sampled): string {
  const base = `${HOSTS[endpoint.host]}${resolvedPath(endpoint)}`;
  const query = endpoint.example.query;
  const urlLine =
    query && Object.keys(query).length > 0
      ? `const url = new URL('${base}');\n${Object.entries(query)
          .map(([name, value]) => `url.searchParams.set('${name}', '${value}');`)
          .join('\n')}\n\n`
      : `const url = '${base}';\n\n`;

  const headers: string[] = [];
  if (keyOptional(endpoint)) headers.push(`...(key ? { 'X-Api-Key': key } : {})`);
  else if (sendsKey(endpoint)) headers.push(`'X-Api-Key': process.env.NEXG_API_KEY`);
  for (const [name, value] of Object.entries(endpoint.example.headers ?? {})) {
    headers.push(`'${name}': '${value}'`);
  }
  if (endpoint.example.body !== undefined) headers.push(`'Content-Type': 'application/json'`);
  const keyLine = keyOptional(endpoint)
    ? '// Optional here: without a key you share the anonymous rate limit.\nconst key = process.env.NEXG_API_KEY;\n'
    : '';

  const options: string[] = [];
  if (endpoint.method !== 'GET') options.push(`method: '${endpoint.method}'`);
  if (headers.length) options.push(`headers: {\n    ${headers.join(',\n    ')},\n  }`);
  if (endpoint.example.body !== undefined) {
    options.push(`body: JSON.stringify(${json(endpoint.example.body, 2)})`);
  }

  const call = options.length
    ? `const res = await fetch(url, {\n  ${options.join(',\n  ')},\n});`
    : 'const res = await fetch(url);';

  return `${urlLine}${keyLine}${call}
const body = await res.json();

if (!body.ok) {
  // Branch on the code; the message is for people.
  throw new Error(\`\${res.status} \${body.error.code}: \${body.error.message}\`);
}
console.log(${hasDataEnvelope(endpoint) ? 'body.data' : 'body'});`;
}

function pythonLiteral(value: unknown, indent: number): string {
  // JSON is nearly Python; only the three literals differ.
  return json(value, indent, 4)
    .replace(/\bnull\b/g, 'None')
    .replace(/\btrue\b/g, 'True')
    .replace(/\bfalse\b/g, 'False');
}

function python(endpoint: Sampled): string {
  const url = `${HOSTS[endpoint.host]}${resolvedPath(endpoint)}`;
  const args: string[] = [`"${url}"`];
  const query = endpoint.example.query;
  if (query && Object.keys(query).length > 0) {
    args.push(
      `params={${Object.entries(query)
        .map(([name, value]) => `"${name}": "${value}"`)
        .join(', ')}}`,
    );
  }
  const headers: string[] = [];
  // requests leaves out a header whose value is None.
  if (keyOptional(endpoint)) headers.push(`"X-Api-Key": os.environ.get("NEXG_API_KEY")`);
  else if (sendsKey(endpoint)) headers.push(`"X-Api-Key": os.environ["NEXG_API_KEY"]`);
  for (const [name, value] of Object.entries(endpoint.example.headers ?? {})) {
    headers.push(`"${name}": "${value}"`);
  }
  if (headers.length) args.push(`headers={${headers.join(', ')}}`);
  if (endpoint.example.body !== undefined)
    args.push(`json=${pythonLiteral(endpoint.example.body, 4)}`);
  args.push('timeout=10');

  const imports = sendsKey(endpoint) ? 'import os\n\nimport requests' : 'import requests';
  const keyNote = keyOptional(endpoint)
    ? '# NEXG_API_KEY is optional here: without it you share the anonymous rate limit.\n'
    : '';
  return `${imports}

${keyNote}res = requests.${endpoint.method.toLowerCase()}(
    ${args.join(',\n    ')},
)
body = res.json()

if not body["ok"]:
    # Branch on the code; the message is for people.
    raise RuntimeError(f'{res.status_code} {body["error"]["code"]}: {body["error"]["message"]}')
print(${hasDataEnvelope(endpoint) ? 'body["data"]' : 'body'})`;
}

export function requestSamples(endpoint: Sampled): CodeSample[] {
  if (endpoint.samples?.length) return endpoint.samples;
  return [
    { language: 'curl', label: 'curl', code: curl(endpoint) },
    { language: 'javascript', label: 'JavaScript', code: javascript(endpoint) },
    { language: 'python', label: 'Python', code: python(endpoint) },
  ];
}
