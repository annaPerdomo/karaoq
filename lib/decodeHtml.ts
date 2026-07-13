// YouTube titles come back HTML-escaped ("Don&#39;t Stop Me Now"). Decoding via
// a detached textarea is the one-liner browsers give us; on the server there's
// no DOM, so the raw string passes through and the client fixes it on hydrate.
export default function decodeHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}
