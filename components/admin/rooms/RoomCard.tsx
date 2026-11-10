import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomRow } from '../types';
import {
  LIVE_EXPLANATION,
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
import { TapHint } from '../TapHint';
import RoomDossier from './RoomDossier';
import { ADMIN_FEATURES } from '../../../lib/adminFeatures';
import { BrandMark, hasBrand } from './BrandPanel';
import { CHEER_EMOJIS, REACTION_COOLDOWN_MS } from '../../../app/queue/cheerConstants';

const ADMIN_CHEER_EMOJIS = CHEER_EMOJIS.slice(0, 3);

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
    <TapHint
      text={`${value} ${label}`}
      className={`${styles.roomStat} ${value === 0 ? styles.roomStatZero : ''}`}
    >
      {icon}
      <span className={styles.roomStatValue}>{value}</span>
    </TapHint>
  );
}

export default function RoomCard({
  room,
  highlight,
  secret,
  expanded,
  merging,
  mergeArmed,
  onToggle,
  onMerge,
  onDelete,
  onCheer,
}: {
  room: RoomRow;
  highlight?: string | null;
  secret: string;
  expanded: boolean;
  merging: boolean;
  mergeArmed: boolean;
  onToggle: () => void;
  onMerge: () => void;
  onDelete: () => void;
  onCheer: (emoji: string) => Promise<boolean>;
}): React.ReactElement {
  const live = isLive(room.lastActivity);
  const cheerable = live && room.playing === true;
  const boards = room.requests + room.singWithMe;
  const used = room.features ?? [];
  const featureChips = ADMIN_FEATURES.filter(
    (f) => used.includes(f.id) && (!f.noChip || f.id === highlight)
  );
  const [cheerLocked, setCheerLocked] = React.useState(false);
  const cheerTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => () => { if (cheerTimer.current) clearTimeout(cheerTimer.current); }, []);
  const cheer = async (emoji: string) => {
    if (cheerLocked) return;
    setCheerLocked(true);
    cheerTimer.current = setTimeout(() => setCheerLocked(false), REACTION_COOLDOWN_MS);
    await onCheer(emoji);
  };

  return (
    <div
      className={`${styles.roomCard} ${merging ? styles.roomCardMerging : ''} ${
        expanded ? styles.roomCardExpanded : ''
      }`}
    >
      <button
        type="button"
        className={`${styles.roomMain} ${cheerable ? styles.roomMainCheerable : ''}`}
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <span className={styles.roomCode}>
          {room.roomId}
          {live && (
            <TapHint
              text={`${LIVE_EXPLANATION} Last action ${timeAgo(room.lastActivity)}.`}
              className={styles.liveBadge}
            >
              <span className={styles.eqBars} aria-hidden="true">
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
              </span>
              live
            </TapHint>
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
          {room.errors > 0 && (
            <TapHint
              text={`${room.errors} client errors recorded in this room`}
              className={styles.errorChip}
            >
              ⚠ {room.errors}
            </TapHint>
          )}
        </span>
        <TapHint
          text={languageMixTitle(room.localeMix ?? [], room.locale ?? null)}
          className={styles.roomLang}
        >
          {languageMixShort(room.localeMix ?? [])}
        </TapHint>
        <span className={styles.roomBadges}>
          <TapHint
            text={
              room.fairMode === null || room.fairMode === undefined
                ? 'Created before fair rotation was recorded'
                : `Fair rotation ${room.fairMode ? 'on' : 'off'}${
                    room.fairToggled ? ' — host changed it' : ' (default)'
                  }`
            }
            className={`${styles.fairChip} ${room.fairMode ? styles.fairChipOn : ''}`}
          >
            {room.fairMode === null || room.fairMode === undefined
              ? 'fair —'
              : `fair ${room.fairMode ? 'on' : 'off'}${room.fairToggled ? '*' : ''}`}
          </TapHint>
          <TapHint
            text={`Auto-advance ${
              room.autoAdvance.enabled ? `on · ${room.autoAdvance.gapSeconds}s gap` : 'off'
            }${room.autoAdvanceChanged ? ' — host changed it' : ' (default)'}`}
            className={`${styles.fairChip} ${room.autoAdvance.enabled ? styles.fairChipOn : ''}`}
          >
            {`auto ${room.autoAdvance.enabled ? 'on' : 'off'}${room.autoAdvanceChanged ? '*' : ''}`}
          </TapHint>
        </span>
        <span className={styles.roomChevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        {(featureChips.length > 0 || hasBrand(room.brand)) && (
          <span className={styles.roomFeatures}>
            {hasBrand(room.brand) && <BrandMark roomId={room.roomId} brand={room.brand} />}
            {featureChips.map((f) => (
              <span
                key={f.id}
                className={`${styles.featureChip} ${
                  f.id === highlight ? styles.featureChipOn : ''
                }`}
              >
                {f.label}
                {f.id === 'ideas' && (room.ideas ?? 0) > 0 && ` ×${room.ideas}`}
                {f.id === 'duets' && room.duets > 0 && ` ×${room.duets}`}
              </span>
            ))}
          </span>
        )}
      </button>

      <div className={styles.roomActions}>
        {cheerable && (
          <span className={styles.roomCheers}>
            {ADMIN_CHEER_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.roomActionBtn} ${styles.roomActionCheer}`}
                onClick={() => void cheer(emoji)}
                disabled={cheerLocked}
                title={`Send ${emoji} to the room's screens`}
                aria-label={`Send ${emoji} cheer to room ${room.roomId}`}
              >
                {emoji}
              </button>
            ))}
          </span>
        )}
        <a
          className={styles.roomActionBtn}
          href={`/host/${room.roomId}?admin=1`}
          target="_blank"
          rel="noopener noreferrer"
          title="Open the room without being counted as a participant"
          aria-label="Open the room without being counted as a participant"
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
          aria-label={
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
          aria-label="Delete room data"
        >
          ×
        </button>
      </div>

      {expanded && <RoomDossier roomId={room.roomId} secret={secret} brand={room.brand} />}
    </div>
  );
}
