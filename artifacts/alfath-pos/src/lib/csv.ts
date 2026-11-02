// Preserve the decoded value, including commas, quotes and embedded newlines.
// Numbers retain the same String conversion previously used by Array.join.
export function toCsvRow(values: readonly (string | number)[]): string {
  return values.map((value) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",");
}
