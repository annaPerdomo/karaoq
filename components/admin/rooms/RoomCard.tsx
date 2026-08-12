import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomRow } from '../types';
import {
  countryFlag,
  formatTimestamp,
  isLive,
  safeDecode,
  timeAgo,
} from '../format';
import {
  languageMixShort,
  languageMixTitle,
} from '../roomDetailLabels';
import { BoardIcon, HeartIcon, MicIcon, PeopleIcon } from '../icons';
import RoomDossier from './RoomDossier';

function locationText(room: RoomRow): string {
  if (room.city) return `${safeDecode(room.city)}, ${room.country ?? ''}`.replace(/, $/, '');
  return room.country ?? '';
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}): React.ReactElement {
  return (
    <span
      className={`${styles.roomStat} ${value === 0 ? styles.roomStatZero : ''}`}
      title={`${value} ${label}`}
    >
      {icon}
      <span className={styles.roomStatValue}>{value}</span>
    </span>
  );
}

export default function RoomCard({
  room,
  secret,
  expanded,
  merging,
  mergeArmed,
  onToggle,
  onMerge,
  onDelete,
}: {
  room: RoomRow;
  secret: string;
  expanded: boolean;
  merging: boolean;
  mergeArmed: boolean;
  onToggle: () => void;
  onMerge: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const live = isLive(room.lastSeen);
  const boards = room.requests + room.singWithMe;

  return (
    <div
      className={`${styles.roomCard} ${merging ? styles.roomCardMerging : ''} ${
        expanded ? styles.roomCardExpanded : ''
      }`}
    >
      <button
        type="button"
        className={styles.roomMain}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={styles.roomCode}>
          {room.roomId}
          {live && (
            <span className={styles.liveBadge} title={`Active ${timeAgo(room.lastSeen)}`}>
              ● live
            </span>
          )}
        </span>
        <span className={styles.roomWhen}>
          <span>{formatTimestamp(room.timestamp)}</span>
          <span className={styles.roomPlace}>
            {countryFlag(room.country)} {locationText(room) || 'Location unknown'}
          </span>
        </span>
        <span className={styles.roomStats}>
          <Stat icon={<PeopleIcon />} value={room.participants} label="people" />
          <Stat icon={<MicIcon />} value={room.songs} label="songs" />
          <Stat icon={<HeartIcon />} value={room.cheers} label="cheers" />
          <Stat
            icon={<BoardIcon />}
            value={boards}
            label="board activity (requests + sing-with-me posts, joins and queues)"
          />
          {room.duets > 0 && (
            <span className={styles.duetChip} title={`${room.duets} duet or group adds`}>
              duet ×{room.duets}
            </span>
          )}
          {room.errors > 0 && (
            <span
              className={styles.errorChip}
              title={`${room.errors} client errors recorded in this room`}
            >
              ⚠ {room.errors}
            </span>
          )}
        </span>
        <span
          className={styles.roomLang}
          title={languageMixTitle(room.localeMix ?? [], room.locale ?? null)}
        >
          {languageMixShort(room.localeMix ?? [])}
        </span>
        <span
          className={`${styles.fairChip} ${room.fairMode ? styles.fairChipOn : ''}`}
          title={
            room.fairMode === null || room.fairMode === undefined
              ? 'Created before fair rotation was recorded'
              : `Fair rotation ${room.fairMode ? 'on' : 'off'}${
                  room.fairToggled ? ' — host changed it' : ' (default)'
                }`
          }
        >
          {room.fairMode === null || room.fairMode === undefined
            ? 'fair —'
            : `fair ${room.fairMode ? 'on' : 'off'}${room.fairToggled ? '*' : ''}`}
        </span>
        <span className={styles.roomChevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      <div className={styles.roomActions}>
        <a
          className={styles.roomActionBtn}
          href={`/host/${room.roomId}?admin=1`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the room without being counted as a participant"
        >
          ↗
        </a>
        <button
          className={`${styles.roomActionBtn} ${merging ? styles.roomActionActive : ''}`}
          onClick={onMerge}
          title={
            !mergeArmed
              ? 'Merge this room into another'
              : merging
                ? 'Cancel merge'
                : `Merge into ${room.roomId}`
          }
        >
          ⧉
        </button>
        <button
          className={`${styles.roomActionBtn} ${styles.roomActionDanger}`}
          onClick={onDelete}
          title="Delete room data"
        >
          ×
        </button>
      </div>

      {expanded && <RoomDossier roomId={room.roomId} secret={secret} />}
    </div>
  );
}
