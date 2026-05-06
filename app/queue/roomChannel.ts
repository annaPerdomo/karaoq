import { QueueEntry } from "../../pages/api/types";

export interface RoomStateMessage {
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
}

const CHANNEL_NAME = "karaoq-room-sync";

let senderChannel: BroadcastChannel | null = null;

function getSenderChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!senderChannel) {
    senderChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  return senderChannel;
}

export function broadcastRoomState(state: RoomStateMessage) {
  const channel = getSenderChannel();
  if (channel) channel.postMessage(state);
}

export function onRoomState(
  callback: (state: RoomStateMessage) => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};

  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<RoomStateMessage>) => {
    callback(event.data);
  };
  return () => channel.close();
}
