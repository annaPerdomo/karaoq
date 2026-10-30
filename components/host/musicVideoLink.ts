import postScreenEvent from "../../app/queue/screenEvent";
import { copyLinkOrShow } from "./clipboard";

/** The gear row's Open / Copy link buttons for the music-video screen. Each
 * closes the settings popover first, same as every other row's handler. */
export function createMusicVideoLink(
  joinCode: string | undefined,
  origin: string,
  showToast: (msg: string) => void,
  copiedMessage: string,
  closeSettings: () => void
): { openMusicVideoScreen: () => void; copyMusicVideoLink: () => void } {
  function url() {
    const base = origin || window.location.origin;
    return `${base}/display/${joinCode}/video`;
  }

  function openMusicVideoScreen() {
    closeSettings();
    if (!joinCode) return;
    window.open(url(), "_blank");
    postScreenEvent(joinCode, "music_video_link", { action: "open" });
  }

  function copyMusicVideoLink() {
    closeSettings();
    if (!joinCode) return;
    copyLinkOrShow(url(), showToast, copiedMessage);
    postScreenEvent(joinCode, "music_video_link", { action: "copy" });
  }

  return { openMusicVideoScreen, copyMusicVideoLink };
}
