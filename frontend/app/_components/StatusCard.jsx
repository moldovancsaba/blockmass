export default function StatusCard({ title, items, variant = "info", note }) {
  // What: High-contrast, accessible status card adhering to the rule:
  //       BLACK TEXT ON WHITE BACKGROUND / WHITE TEXT ON BLACK BACKGROUND.
  // Why: Ensure clarity and compliance without adding dependencies.
  const invert = variant === "error"; // Emphasize errors in white-on-black
  const bg = invert ? "#000000" : "#FFFFFF";
  const fg = invert ? "#FFFFFF" : "#000000";
  const border = invert ? "#FFFFFF" : "#000000";

  return (
    <div style={{
      border: `1px solid ${border}`,
      background: bg,
      color: fg,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{
          display: "inline-block",
          width: 10,
          height: 10,
          borderRadius: 999,
          background: fg,
        }} />
        <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
      </div>
      {note && (
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{note}</div>
      )}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((it, idx) => (
          <li key={idx} style={{ lineHeight: "1.6" }}>
            <span style={{ fontWeight: 600 }}>{it.label}: </span>
            <span>{String(it.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
