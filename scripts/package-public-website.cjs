// Build a standard ZIP32 with native Node I/O, compression and CRC verification.
// The Python release driver supplies the exact allowlisted paths and verifies it.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const [root, output, input] = process.argv.slice(2);
const {files, manifest} = JSON.parse(fs.readFileSync(input, 'utf8'));
if (files.length + 1 > 65535) throw Error('ZIP32 file count exceeded');
const blocks = [], central = [];
let offset = 0;
const stamp = new Date();
const dosTime = (stamp.getHours() << 11) | (stamp.getMinutes() << 5) | (stamp.getSeconds() >> 1);
const dosDate = ((stamp.getFullYear() - 1980) << 9) | ((stamp.getMonth() + 1) << 5) | stamp.getDate();
function append(name, data) {
  if (name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw Error('Unsafe ZIP path');
  const filename = Buffer.from(name, 'utf8');
  const compressed = zlib.deflateRawSync(data, {level: 6});
  const crc = zlib.crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8);
  header.writeUInt16LE(dosTime, 10); header.writeUInt16LE(dosDate, 12);
  header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50, 0); record.writeUInt16LE(20, 4);
  header.copy(record, 6, 4, 30); record.writeUInt32LE(offset, 42);
  blocks.push(header, filename, compressed); central.push(record, filename);
  offset += header.length + filename.length + compressed.length;
  if (offset > 0xffffffff) throw Error('ZIP32 size exceeded');
}
for (const [index, relative] of files.entries()) {
  append(relative, fs.readFileSync(path.join(root, relative)));
  if ((index + 1) % 5000 === 0) console.log(`Arhivare Node: ${index + 1}/${files.length}`);
}
append('.codex-release-manifest.json', Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length + 1, 8); end.writeUInt16LE(files.length + 1, 10);
end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
fs.writeFileSync(output, Buffer.concat([...blocks, directory, end]));
