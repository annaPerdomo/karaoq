// YouTube IFrame API: 101 and 150 are the owner disabling embedding, 100 a video
// gone or private. The rest (2, 5) are player faults and say nothing about it.
export const UNPLAYABLE_PLAYER_CODES = [100, 101, 150];
