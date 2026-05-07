export interface ApiError {
  code: number;
  message: string;
}

export interface Reaction {
  id: string;
  emoji: string;
  userName: string;
  timestamp: number;
}

export interface Room {
  id: string;
  queue: QueueEntry[];
  activeVideoIndex: number;
  isPlaying: boolean;
  reactionsEnabled: boolean;
  reactions?: Reaction[];
}

export interface QueueEntry {
  id: string;
  userName: string;
  songTitle: string;
  videoId: string;
}
