export function fmt(n) {
  return `£${Number(n || 0).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function r2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
