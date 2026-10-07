/** Pick one display unit for a chart so axis ticks and labels stay short ("7.05", unit named once). */
export interface Scale { divisor: number; unit: string }

export function pickScale(maxAbs: number, currency: string): Scale {
  if (currency === "NPR") {
    if (maxAbs >= 1e7) return { divisor: 1e7, unit: "NPR crore" };
    if (maxAbs >= 1e5) return { divisor: 1e5, unit: "NPR lakh" };
    return { divisor: 1, unit: "NPR" };
  }
  if (maxAbs >= 1e9) return { divisor: 1e9, unit: `${currency} billion` };
  if (maxAbs >= 1e6) return { divisor: 1e6, unit: `${currency} million` };
  if (maxAbs >= 1e3) return { divisor: 1e3, unit: `${currency} thousand` };
  return { divisor: 1, unit: currency };
}

export function scaled(value: number, s: Scale): string {
  const v = value / s.divisor;
  if (s.divisor === 1) return Math.round(v).toLocaleString("en-IN");
  return v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
}
