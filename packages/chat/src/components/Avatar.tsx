function initials(name?: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Avatar({ name, url, size = 36 }: { name?: string | null; url?: string | null; size?: number }) {
  const s = { width: size, height: size };
  if (url) {
    return <img src={url} alt={name ?? ""} style={s} className="shrink-0 rounded-full object-cover" />;
  }
  return (
    <div
      style={{ ...s, fontSize: size * 0.4 }}
      className="flex shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary"
    >
      {initials(name)}
    </div>
  );
}
