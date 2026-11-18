// Minimal RFC-4180 CSV reader/writer (quotes, escaped quotes, CRLF, embedded newlines).

export function detectDelimiter(headerLine: string): string {
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = -1;
  for (const d of candidates) {
    const c = headerLine.split(d).length;
    if (c > bestCount) {
      best = d;
      bestCount = c;
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const d = delimiter ?? detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === d) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }
  return rows;
}

export function toCsv(rows: (string | number | null | undefined)[][], delimiter = ','): string {
  return (
    rows
      .map((r) =>
        r
          .map((v) => {
            const s = v == null ? '' : String(v);
            return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(delimiter),
      )
      .join('\n') + '\n'
  );
}
