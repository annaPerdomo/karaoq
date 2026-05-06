import { QueueEntry } from "../../pages/api/types";

export interface RoomStateMessage {
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
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
