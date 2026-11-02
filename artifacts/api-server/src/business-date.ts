// Existing operational boundary, unchanged: WIB and 06:00, not the overdue-shift boundary.
export function getLogicalShiftDate(d: Date = new Date()) {
  const wibTime = d.getTime() + (7 * 60 * 60 * 1000);
  const wibDate = new Date(wibTime);
  if (wibDate.getUTCHours() < 6) {
    wibDate.setUTCDate(wibDate.getUTCDate() - 1);
  }
  const year = wibDate.getUTCFullYear();
  const month = String(wibDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(wibDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
