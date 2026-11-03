/* Package only this design collection, without external dependencies. */
const fs = require("node:fs/promises");
const path = require("node:path");
const root = __dirname;

const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function main() {
  const verification = JSON.parse(
    await fs.readFile(path.join(root, "verification.json"), "utf8"),
  );
  if (verification.status !== "passed" || verification.count !== 34)
    throw new Error("Render and verify all 34 designs before packaging.");
  const entries = await fs.readdir(root, {
    recursive: true,
    withFileTypes: true,
  });
  const files = entries.filter(
    (e) =>
      e.isFile() && /\.(?:png|woff2|txt|html|json|css|cjs|md)$/.test(e.name),
  );
  const records = [],
    central = [];
  let offset = 0;
  for (const entry of files) {
    const absolute = path.join(entry.parentPath || entry.path, entry.name);
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    const name = Buffer.from("nexg-merchant-emails/" + relative);
    const data = await fs.readFile(absolute);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(23905, 12); // 1 November 2026
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    records.push(local, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8);
    directory.writeUInt16LE(23905, 14);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    central.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const index = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(index.length, 12);
  end.writeUInt32LE(offset, 16);
  const output = path.join(root, "nexg-merchant-email-designs.zip");
  await fs.writeFile(output, Buffer.concat([...records, index, end]));
  process.stdout.write(JSON.stringify({ output, files: files.length }) + "\n");
}
main().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
