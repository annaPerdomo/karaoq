import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { ProposalRow as ProposalRowData } from '../types';
import { countryFlag } from '../format';

type Identity = { artist: string; title: string };
type View = 'pending' | 'promoted' | 'rejected' | 'unnamed';
type ApproveResult = { result: 'promoted' | 'duplicate' | 'unnamed'; songId?: string };
type RejectResult = { result: 'rejected'; removedSongId?: string };

function flags(countries: string[]): string {
  return countries.map((code) => countryFlag(code)).filter(Boolean).join(' ');
}

export default function ProposalRow({
  row,
  view,
  onApprove,
  onReject,
  onRemove,
}: {
  row: ProposalRowData;
  view: View;
  onApprove: (id: string, identity: Identity) => Promise<ApproveResult>;
  onReject: (id: string) => Promise<RejectResult>;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const [picked, setPicked] = React.useState<Identity | null>(row.picked);
  const [artist, setArtist] = React.useState('');
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  const canSwap = Boolean(picked && picked.artist && picked.title);
  const identity: Identity | null =
    artist.trim() && title.trim() ? { artist: artist.trim(), title: title.trim() } : picked;

  async function approve(): Promise<void> {
    if (!identity) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await onApprove(row.id, identity);
      if (outcome.result === 'duplicate') {
        setNote(`Already in the corpus as ${outcome.songId}`);
      } else {
        onRemove(row.id);
      }
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function reject(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await onReject(row.id);
      onRemove(row.id);
    } catch {
      setError("Couldn't reach the server — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.rankRow}>
      <span className={styles.rankMain}>
        <span className={styles.rankTitle}>
          <span className={styles.rankTitleText}>
            {picked ? `${picked.title} — ${picked.artist}` : row.label}
          </span>
          {row.qualifies && (
            <span className={`${styles.wantedTag} ${styles.wantedTagHeld}`}>QUALIFIES</span>
          )}
          {canSwap && picked && (
            <button
              type="button"
              className={styles.retryBtn}
              disabled={busy}
              onClick={() => setPicked({ artist: picked.title, title: picked.artist })}
            >
              Swap
            </button>
          )}
        </span>
        <span className={styles.rankSub}>
          <span className={styles.wantedFlags} aria-hidden="true">
            {flags(row.countries)}
          </span>
          {`${row.rooms} rooms · ${row.searchRooms} searching · ${row.countries.length} countries`}
        </span>
        {!picked && (
          <span className={styles.rankSub}>
            {row.candidates.map((c) => (
              <button
                key={`${c.artist}-${c.title}`}
                type="button"
                className={styles.retryBtn}
                disabled={busy}
                onClick={() => setPicked(c)}
              >
                {c.title} — {c.artist}
              </button>
            ))}
          </span>
        )}
        {view === 'unnamed' && (
          <span className={styles.rankSub}>
            <input
              className={styles.roomSearch}
              placeholder="Artist"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
            />
            <input
              className={styles.roomSearch}
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </span>
        )}
        {row.videoIds.length > 0 && (
          <span className={styles.rankSub}>
            {row.videoIds.map((id) => (
              <a
                key={id}
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noreferrer"
                className={styles.roomJumpChip}
              >
                {id}
              </a>
            ))}
          </span>
        )}
        {view === 'promoted' && row.promotedSongId && (
          <span className={styles.rankSub}>{row.promotedSongId}</span>
        )}
        {note && <p className={styles.empty}>{note}</p>}
        {error && <p className={styles.empty}>{error}</p>}
      </span>
      <span className={styles.roomBadges}>
        {(view === 'pending' || view === 'unnamed') && (
          <>
            <button
              type="button"
              className={styles.retryBtn}
              disabled={busy || !identity}
              onClick={approve}
            >
              Approve
            </button>
            <button type="button" className={styles.retryBtn} disabled={busy} onClick={reject}>
              Reject
            </button>
          </>
        )}
        {view === 'promoted' && (
          <button type="button" className={styles.retryBtn} disabled={busy} onClick={reject}>
            Remove
          </button>
        )}
      </span>
    </div>
  );
}
