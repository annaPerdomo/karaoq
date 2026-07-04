import { QueueEntry, Reaction } from "../../pages/api/types";

export interface RoomStateMessage {
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
  reactionsEnabled: boolean;
  reactions?: Reaction[];
}

function channelName(roomId: string): string {
  return `karaoq-room-sync:${roomId}`;
}

const senderChannels = new Map<string, BroadcastChannel>();

function getSenderChannel(roomId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!senderChannels.has(roomId)) {
    senderChannels.set(roomId, new BroadcastChannel(channelName(roomId)));
  }
  return senderChannels.get(roomId)!;
}

export function broadcastRoomState(roomId: string, state: RoomStateMessage) {
  const channel = getSenderChannel(roomId);
  if (channel) channel.postMessage(state);
}

export function onRoomState(
  roomId: string,
  callback: (state: RoomStateMessage) => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};

  const channel = new BroadcastChannel(channelName(roomId));
  channel.onmessage = (event: MessageEvent<RoomStateMessage>) => {
    callback(event.data);
  };
  return () => channel.close();
}

// Display pause/resume commands (Host → Display for TV mode). The display also
// picks this up from its room poll; the broadcast just lets a same-browser
// display (e.g. the projector window the host opened) react instantly instead
// of waiting out the poll.
export function broadcastDisplayPause(roomId: string, paused: boolean) {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(`karaoq-display-pause:${roomId}`);
  ch.postMessage(paused);
  ch.close();
}

export function onDisplayPause(
  roomId: string,
  callback: (paused: boolean) => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(`karaoq-display-pause:${roomId}`);
  ch.onmessage = (e: MessageEvent<boolean>) => callback(e.data);
  return () => ch.close();
}

// Video-ended events (Display → Host for TV mode)
export function broadcastVideoEnded(roomId: string) {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(`karaoq-video-ended:${roomId}`);
  ch.postMessage(null);
  ch.close();
}

export function onVideoEnded(
  roomId: string,
  callback: () => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const ch = new BroadcastChannel(`karaoq-video-ended:${roomId}`);
  ch.onmessage = () => callback();
  return () => ch.close();
}
