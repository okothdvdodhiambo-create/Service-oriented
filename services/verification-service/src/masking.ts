export function maskHolderName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.map((part) => {
    const first = Array.from(part)[0] ?? "";
    return `${first}${"*".repeat(Math.max(3, Array.from(part).length - 1))}`;
  }).join(" ");
}

export function maskDocumentNumber(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const visible = Array.from(value).slice(-4).join("");
  return `${"*".repeat(Math.max(4, Array.from(value).length - visible.length))}${visible}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character] ?? character);
}
