import { describe, it, expect } from "vitest";
import { shouldClaimPlayback } from "../../components/host/utils";

// A co-host's Play sets isPlaying with no playToken. In here-mode the host page
// is the only thing that can actually sound the song, so it adopts that start.
// Every guard below exists because getting it wrong ruins a live room.
const claimable = {
  remote: false,
  tvMode: false,
  adminPeek: false,
  isPlaying: true,
  serverPlayToken: null,
  hasCurrentSong: true,
  visible: true,
};

describe("which host page adopts a surface-less start", () => {
  it("claims a playing here-mode room that nothing has claimed", () => {
    expect(shouldClaimPlayback(claimable)).toBe(true);
  });

  it("leaves a claimed room alone", () => {
    // Someone already holds the surface; claiming would double-play the song.
    expect(
      shouldClaimPlayback({ ...claimable, serverPlayToken: "another-tab" })
    ).toBe(false);
  });

  it("never claims from a co-host screen", () => {
    expect(shouldClaimPlayback({ ...claimable, remote: true })).toBe(false);
  });

  it("never claims in TV mode, where the display is the surface", () => {
    expect(shouldClaimPlayback({ ...claimable, tvMode: true })).toBe(false);
  });

  it("never claims from an admin peek", () => {
    // Mission Control opens live rooms; claiming would move a paying venue's
    // audio onto the operator's laptop.
    expect(shouldClaimPlayback({ ...claimable, adminPeek: true })).toBe(false);
  });

  it("never claims from a hidden tab", () => {
    // A forgotten background tab would put the night's audio on the wrong screen.
    expect(shouldClaimPlayback({ ...claimable, visible: false })).toBe(false);
  });

  it("never claims when nothing is cued up", () => {
    // A stale Play aimed at a song that already finished. Claiming would leave
    // the room reporting playback over silence — and because the self-heal keys
    // on the token being absent, the claim would disarm the only recovery.
    expect(shouldClaimPlayback({ ...claimable, hasCurrentSong: false })).toBe(
      false
    );
  });

  it("does nothing while the room is stopped", () => {
    expect(shouldClaimPlayback({ ...claimable, isPlaying: false })).toBe(false);
  });
});
