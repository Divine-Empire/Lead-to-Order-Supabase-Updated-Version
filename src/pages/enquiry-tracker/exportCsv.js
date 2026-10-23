// CSV helpers for the Enquiry Tracker export.

const escapeCell = (v) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns: [{ label, get(row) }]. UTF-8 BOM so Excel reads non-ASCII text.
export function downloadCsv(filename, columns, rows) {
  const lines = [
    columns.map((c) => escapeCell(c.label)).join(","),
    ...rows.map((r) => columns.map((c) => escapeCell(c.get(r))).join(",")),
  ];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
