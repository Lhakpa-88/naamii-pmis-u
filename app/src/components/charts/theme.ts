/** Chart colours mirror the NAAMII design tokens in globals.css (hex for SVG attributes). */
export const chartTheme = {
  actual: "#454d59",        // Dark Blue Grey
  budget: "#a1a6b2",        // Cool Grey (fill) …
  budgetStroke: "#737370",  // … with a Neutral Grey edge for contrast on white
  forecast: "#737370",      // dashed line = secondary encoding
  single: "#454d59",
  critical: "#db0505",
  grid: "#e6e8ec",
  axis: "#737370",
  text: "#454d59",
  muted: "#737370",
};

export const axisStyle = { fontSize: 11.5, fill: chartTheme.muted, fontFamily: "inherit" };
export const tooltipStyle = {
  borderRadius: 6,
  border: "1px solid #d2d5db",
  boxShadow: "none",
  fontSize: 12.5,
  color: chartTheme.text,
  padding: "8px 10px",
};
