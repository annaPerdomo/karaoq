export function decodeHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

export function isTextReaction(emoji: string): boolean {
  return emoji.length > 2 && /[a-zA-Z]/.test(emoji);
}
