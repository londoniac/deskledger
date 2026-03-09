export function fmt(n) {
  return `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function fmtDate(dateStr) {
  if (!dateStr) return "";
  // Handle YYYY-MM-DD from postgres
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    const [y, m, d] = dateStr.split(/[-T]/);
    return `${d}/${m}/${y}`;
  }
  return dateStr;
}
