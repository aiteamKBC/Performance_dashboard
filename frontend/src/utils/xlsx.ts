// Minimal, dependency-free .xlsx (Office Open XML) writer.
//
// Produces a genuine SpreadsheetML workbook with a single worksheet and packs
// it into a ZIP using "stored" (uncompressed) entries. That's enough for Excel,
// Numbers and Google Sheets to open the file cleanly — without the
// "file format and extension don't match" warning you get from the older
// HTML-table-as-.xls trick, and without pulling in a heavy SheetJS dependency.
//
// Cells that are finite numbers are written as numeric cells (so Excel can sum
// and pivot them); everything else is written as an inline string.

export type Cell = string | number | null | undefined;

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : c === "'" ? "&apos;" : "&quot;",
  );
}

// 0-based column index -> Excel column letters (0 -> A, 25 -> Z, 26 -> AA, ...).
function colLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Sheet names cannot exceed 31 chars or contain : \ / ? * [ ]
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return cleaned || "Sheet1";
}

function worksheetXml(rows: Cell[][]): string {
  const body = rows
    .map((row, ri) => {
      const cells = row
        .map((cell, ci) => {
          const ref = `${colLetter(ci)}${ri + 1}`;
          if (cell == null || cell === "") return "";
          if (typeof cell === "number" && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
        })
        .join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

// --- ZIP (stored / no compression) ---------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const u16 = (n: number) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

function zip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    const localHeader = new Uint8Array([
      ...u32(0x04034b50), // local file header signature
      ...u16(20), ...u16(0), ...u16(0), // version needed, flags, method (stored)
      ...u16(0), ...u16(0), // mod time, mod date
      ...u32(crc), ...u32(size), ...u32(size), // crc, compressed size, uncompressed size
      ...u16(nameBytes.length), ...u16(0), // name length, extra length
    ]);
    parts.push(localHeader, nameBytes, file.data);

    central.push(
      new Uint8Array([
        ...u32(0x02014b50), // central directory header signature
        ...u16(20), ...u16(20), ...u16(0), ...u16(0), // version made by, needed, flags, method
        ...u16(0), ...u16(0), // mod time, mod date
        ...u32(crc), ...u32(size), ...u32(size),
        ...u16(nameBytes.length), ...u16(0), ...u16(0), // name, extra, comment lengths
        ...u16(0), ...u16(0), ...u32(0), // disk start, internal attrs, external attrs
        ...u32(offset), // local header offset
      ]),
      nameBytes,
    );

    offset += localHeader.length + nameBytes.length + size;
  }

  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50), // end of central directory signature
    ...u16(0), ...u16(0), // disk numbers
    ...u16(files.length), ...u16(files.length), // entries on disk, total entries
    ...u32(cdSize), ...u32(offset), // central dir size, offset
    ...u16(0), // comment length
  ]);

  return new Blob([...parts, ...central, end], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Build a single-worksheet .xlsx Blob from a grid of rows. */
export function buildXlsx(sheetName: string, rows: Cell[][]): Blob {
  const enc = new TextEncoder();
  const name = escapeXml(sanitizeSheetName(sheetName));

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  return zip([
    { name: "[Content_Types].xml", data: enc.encode(contentTypes) },
    { name: "_rels/.rels", data: enc.encode(rootRels) },
    { name: "xl/workbook.xml", data: enc.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: enc.encode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: enc.encode(worksheetXml(rows)) },
  ]);
}

/** Build the workbook and trigger a browser download. */
export function downloadXlsx(filename: string, sheetName: string, rows: Cell[][]): void {
  const blob = buildXlsx(sheetName, rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
