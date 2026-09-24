/**
 * Utility functions for exporting CRM datasets to CSV/Excel format.
 * Includes UTF-8 BOM (\uFEFF) so Excel correctly displays symbols (₹, quotes, emojis).
 */

export interface ExportColumn<T> {
  header: string;
  accessor: (item: T) => string | number | null | undefined;
}

/**
 * Escapes a cell value according to RFC-4180 CSV specifications.
 */
export function escapeCSVValue(val: unknown): string {
  if (val === null || val === undefined) return '""';
  let str = String(val).trim();
  // If string contains comma, quote, or newline, escape internal quotes by doubling them
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  } else {
    str = `"${str}"`;
  }
  return str;
}

/**
 * Converts an array of objects into a CSV string.
 */
export function generateCSV<T>(data: T[], columns: ExportColumn<T>[]): string {
  const headerRow = columns.map((col) => escapeCSVValue(col.header)).join(',');
  const rows = data.map((item) =>
    columns.map((col) => escapeCSVValue(col.accessor(item))).join(',')
  );

  // Prepend UTF-8 BOM so Microsoft Excel automatically recognizes UTF-8 encoding
  return '\uFEFF' + [headerRow, ...rows].join('\r\n');
}

/**
 * Triggers a browser download of the CSV data.
 */
export function downloadCSV(filename: string, csvContent: string): void {
  if (typeof window === 'undefined') return;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
