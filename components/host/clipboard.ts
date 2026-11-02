/** Copies to the clipboard, falling back to showing the url on failure. Never
 * throws: a missing `navigator.clipboard` throws synchronously (not a rejected
 * promise), caught here so a caller's next line always runs. */
export function copyLinkOrShow(
  url: string,
  showToast: (msg: string) => void,
  copiedMessage: string
): void {
  try {
    navigator.clipboard
      .writeText(url)
      .then(() => showToast(copiedMessage))
      .catch(() => showToast(url));
  } catch {
    showToast(url);
  }
}
