// Minimaler ZIP-Encoder mit STORE-Method (keine Compression).
// Bewusst keine externe Dependency: PDFs/JPGs sind ohnehin schon komprimiert,
// und STORE läuft im Cloudflare-Workers-Runtime ohne Memory-Bloat.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array, prev = 0xffffffff): number {
  let c = prev;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  }
  return c;
}

function dosDate(d = new Date()): { time: number; date: number } {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  date: number;
  time: number;
};

function le16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}
function le32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

const TEXT_ENCODER = new TextEncoder();

function sanitizeFilename(name: string): string {
  // ZIP-Names sollten relative Paths sein, ohne führenden Slash, keine ../
  return name.replace(/[\\/]/g, '_').replace(/^\.+/, '_');
}

function uniquify(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  for (let i = 2; i < 1000; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  // Fallback
  used.add(name + '-' + Date.now());
  return name + '-' + Date.now();
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

/**
 * Synchroner ZIP-Builder. Hält alle Bytes im Speicher — für die Akte
 * mit max. 10 Files à 25 MB ist das vertretbar (~250 MB worst case;
 * realistisch <50 MB pro Akte).
 */
export function buildZip(entries: ZipEntry[]): Uint8Array {
  const usedNames = new Set<string>();
  const central: CentralRecord[] = [];
  const chunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const cleanName = uniquify(sanitizeFilename(entry.name), usedNames);
    const nameBytes = TEXT_ENCODER.encode(cleanName);
    const crc = crc32(entry.data) ^ 0xffffffff;
    const { date, time } = dosDate();

    // Local file header (30 Bytes + name)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lhView = new DataView(localHeader.buffer);
    le32(lhView, 0, 0x04034b50);     // signature
    le16(lhView, 4, 20);              // version needed
    le16(lhView, 6, 0x0800);          // flags (UTF-8)
    le16(lhView, 8, 0);                // compression: STORE
    le16(lhView, 10, time);
    le16(lhView, 12, date);
    le32(lhView, 14, crc >>> 0);
    le32(lhView, 18, entry.data.length); // compressed size
    le32(lhView, 22, entry.data.length); // uncompressed size
    le16(lhView, 26, nameBytes.length);
    le16(lhView, 28, 0);               // extra
    localHeader.set(nameBytes, 30);

    chunks.push(localHeader);
    chunks.push(entry.data);

    central.push({
      name: nameBytes,
      crc: crc >>> 0,
      size: entry.data.length,
      offset,
      date,
      time,
    });

    offset += localHeader.length + entry.data.length;
  }

  // Central directory
  const centralStart = offset;
  for (const rec of central) {
    const cdh = new Uint8Array(46 + rec.name.length);
    const v = new DataView(cdh.buffer);
    le32(v, 0, 0x02014b50);          // signature
    le16(v, 4, 20);                  // version made by
    le16(v, 6, 20);                  // version needed
    le16(v, 8, 0x0800);              // flags
    le16(v, 10, 0);                  // compression
    le16(v, 12, rec.time);
    le16(v, 14, rec.date);
    le32(v, 16, rec.crc);
    le32(v, 20, rec.size);
    le32(v, 24, rec.size);
    le16(v, 28, rec.name.length);
    le16(v, 30, 0);                  // extra
    le16(v, 32, 0);                  // comment
    le16(v, 34, 0);                  // disk
    le16(v, 36, 0);                  // internal attrs
    le32(v, 38, 0);                  // external attrs
    le32(v, 42, rec.offset);
    cdh.set(rec.name, 46);
    chunks.push(cdh);
    offset += cdh.length;
  }
  const centralSize = offset - centralStart;

  // End of central directory
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  le32(ev, 0, 0x06054b50);
  le16(ev, 4, 0);
  le16(ev, 6, 0);
  le16(ev, 8, central.length);
  le16(ev, 10, central.length);
  le32(ev, 12, centralSize);
  le32(ev, 16, centralStart);
  le16(ev, 20, 0);
  chunks.push(eocd);

  // Concat chunks
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const result = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    result.set(c, p);
    p += c.length;
  }
  return result;
}
