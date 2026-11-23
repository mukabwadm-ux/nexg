// Writes src/types.ts: the API's types as plain TypeScript, resolved from the
// zod schemas in @nexg/contracts, so the published package needs neither the
// contracts nor zod. src/types.test.ts checks they still match.
//
// Run: pnpm --filter @nexg-org/api-client generate
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'src', 'types.ts');
const entryPath = join(root, 'src', '__generate_types__.ts');

/** The types the client exports, by name, and what each is in the contracts. */
const TYPES = {
  ApiOrder: 'C.ApiOrder',
  ApiService: 'C.ApiService',
  BookingReceipt: 'C.BookingReceipt',
  BookingRequest: 'z.input<typeof C.ServiceBooking>',
  BookingStatus: 'C.BookingStatus',
  CatalogueItem: 'C.CatalogueItem',
  DeliveryCheck: 'C.DeliveryCheck',
  DeliveryCheckRequest: 'C.DeliveryCheckRequest',
  DeliveryRefusal: 'C.DeliveryRefusal',
  PublicBranch: 'C.PublicBranch',
  PublicEvent: 'C.PublicEvent',
  PublicMerchant: 'C.PublicMerchant',
  PublicZone: 'C.PublicZone',
  WebhookEvent: 'C.WebhookEvent',
  WebhookEventType: 'C.WebhookEventType',
};

const entrySource = [
  "import type { z } from 'zod';",
  "import type * as C from '@nexg/contracts/api';",
  ...Object.entries(TYPES).map(([name, type]) => `export type ${name} = ${type};`),
].join('\n');

const config = ts.getParsedCommandLineOfConfigFile(
  join(root, 'tsconfig.json'),
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
    },
  },
);
const options = { ...config.options, noEmit: true, incremental: false };
const isEntry = (fileName) => resolve(fileName) === resolve(entryPath);

const host = ts.createCompilerHost(options);
const getSourceFile = host.getSourceFile.bind(host);
const fileExists = host.fileExists.bind(host);
const readFile = host.readFile.bind(host);
host.getSourceFile = (fileName, languageVersion, ...rest) =>
  isEntry(fileName)
    ? ts.createSourceFile(fileName, entrySource, languageVersion, true)
    : getSourceFile(fileName, languageVersion, ...rest);
host.fileExists = (fileName) => isEntry(fileName) || fileExists(fileName);
host.readFile = (fileName) => (isEntry(fileName) ? entrySource : readFile(fileName));

const program = ts.createProgram([entryPath], options, host);
const problems = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => d.file && isEntry(d.file.fileName));
if (problems.length > 0) {
  throw new Error(
    problems.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')).join('\n'),
  );
}
const checker = program.getTypeChecker();
const F = ts.TypeFlags;
const PRIMITIVE =
  F.String |
  F.Number |
  F.Boolean |
  F.BigInt |
  F.Null |
  F.Undefined |
  F.Unknown |
  F.Any |
  F.Never |
  F.StringLiteral |
  F.NumberLiteral |
  F.BooleanLiteral;

/** A union's members as text, with true | false written as boolean. */
function printMembers(members, indent) {
  const isBool = (t) => (t.flags & F.BooleanLiteral) !== 0;
  const both =
    members.some((t) => isBool(t) && checker.typeToString(t) === 'true') &&
    members.some((t) => isBool(t) && checker.typeToString(t) === 'false');
  const parts = [];
  for (const member of members) {
    const text = both && isBool(member) ? 'boolean' : print(member, indent);
    if (!parts.includes(text)) parts.push(text);
  }
  // null and undefined read best last.
  parts.sort(
    (a, b) => Number(a === 'null' || a === 'undefined') - Number(b === 'null' || b === 'undefined'),
  );
  return parts.join(' | ');
}

function print(type, indent) {
  if (type.isUnion()) return printMembers(type.types, indent);
  if (type.flags & PRIMITIVE) return checker.typeToString(type);
  if (checker.isArrayType(type)) {
    const [element] = checker.getTypeArguments(type);
    const inner = print(element, indent);
    return element.isUnion() ? `(${inner})[]` : `${inner}[]`;
  }
  if (type.flags & F.Object) {
    const pad = '  '.repeat(indent + 1);
    const lines = [];
    for (const info of checker.getIndexInfosOfType(type)) {
      lines.push(
        `${pad}[key: ${checker.typeToString(info.keyType)}]: ${print(info.type, indent + 1)};`,
      );
    }
    for (const prop of checker.getPropertiesOfType(type)) {
      const optional = (prop.flags & ts.SymbolFlags.Optional) !== 0;
      const propType = checker.getTypeOfSymbol(prop);
      const members = propType.isUnion() ? propType.types : [propType];
      const kept = optional ? members.filter((t) => !(t.flags & F.Undefined)) : members;
      const doc = ts.displayPartsToString(prop.getDocumentationComment(checker)).trim();
      if (doc) lines.push(`${pad}/** ${doc.replace(/\s*\n\s*/g, ' ')} */`);
      const name = /^[A-Za-z_$][\w$]*$/.test(prop.name) ? prop.name : JSON.stringify(prop.name);
      lines.push(`${pad}${name}${optional ? '?' : ''}: ${printMembers(kept, indent + 1)};`);
    }
    return `{\n${lines.join('\n')}\n${'  '.repeat(indent)}}`;
  }
  throw new Error(`Cannot write ${checker.typeToString(type)} as plain TypeScript.`);
}

const source = program.getSourceFile(entryPath);
const declarations = source.statements.filter(ts.isTypeAliasDeclaration);
const body = declarations.map(
  (d) => `export type ${d.name.text} = ${print(checker.getTypeAtLocation(d.name), 0)};`,
);

writeFileSync(
  out,
  [
    '/*',
    ' * Generated from @nexg/contracts by scripts/generate-types.mjs: the',
    " * API's own schemas, written as plain TypeScript so this package needs",
    ' * neither the contracts nor zod. Do not edit by hand: run',
    ' * `pnpm --filter @nexg-org/api-client generate`. src/types.test.ts fails',
    ' * when these no longer match the schemas.',
    ' */',
    '',
    ...body.flatMap((text) => [text, '']),
  ].join('\n'),
);
console.log(`Wrote ${declarations.length} types to ${out}`);
