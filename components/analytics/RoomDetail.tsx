import * as React from 'react';
import styles from '../../styles/Analytics.module.css';
import DetailRows from './DetailRows';
import LayoutPreview from './LayoutPreview';
import {
  fairLabel,
  fairTitle,
  formatTime,
  languageLabel,
  locationLabel,
  roomLanguageLabel,
  roomLanguageTitle,
  songTitleLabel,
  SWM_LABELS,
  VIA_LABELS,
  type RoomDetailData,
} from './roomDetailLabels';

type Tab = 'people' | 'songs' | 'requests' | 'singWithMe' | 'layout';

const RoomDetail = ({
  roomId,
  secret,
  onClose,
}: {
  roomId: string;
  secret: string;
  onClose: () => void;
}): React.ReactElement => {
  const [data, setData] = React.useState<RoomDetailData | null>(null);
  const [error, setError] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>('people');

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`/api/analytics/room?roomId=${encodeURIComponent(roomId)}`, {
      headers: { 'x-analytics-secret': secret },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load room');
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, secret]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const c = data?.counts;

  return (
    <div className={styles.detailOverlay} onClick={onClose}>
      <div
        className={styles.detailModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Room ${roomId} details`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.detailHeader}>
          <h2 className={styles.detailTitle}>{roomId}</h2>
          <div className={styles.detailHeaderActions}>
            <a
              className={styles.detailOpenBtn}
              href={`/host/${roomId}?admin=1`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the room without being counted as a participant"
            >
              Open as admin ↗
            </a>
            <button className={styles.detailClose} onClick={onClose} aria-label="Close">
              &times;
            </button>
          </div>
        </div>

        {error ? (
          <p className={styles.detailEmpty}>Couldn&rsquo;t load room details.</p>
        ) : !data ? (
          <p className={styles.detailEmpty}>Loading…</p>
        ) : (
          <>
            <div className={styles.detailTabs}>
              <button
                className={`${styles.detailTab} ${tab === 'people' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('people')}
              >
                People {c ? `(${c.people})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'songs' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('songs')}
              >
                Songs {c ? `(${c.songs})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'requests' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('requests')}
              >
                Requests {c ? `(${c.requests})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'singWithMe' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('singWithMe')}
              >
                Sing With Me {c ? `(${c.singWithMe})` : ''}
              </button>
              <button
                className={`${styles.detailTab} ${tab === 'layout' ? styles.detailTabActive : ''}`}
                onClick={() => setTab('layout')}
              >
                Layout
              </button>
            </div>

            <div className={styles.detailBody}>
              {tab === 'people' && (
                <DetailRows
                  empty="No one joined this room."
                  rows={data.people.map((p) => ({
                    title: p.userName || 'Anonymous',
                    badge: p.role || undefined,
                    badgeKind: 'role' as const,
                    meta: [
                      locationLabel(p),
                      languageLabel(p),
                      formatTime(p.firstSeen),
                    ],
                  }))}
                />
              )}

              {tab === 'songs' && (
                <DetailRows
                  empty="No songs added."
                  rows={data.songs.map((s) => ({
                    title: songTitleLabel(s.songTitle, s.timestamp),
                    badge: VIA_LABELS[s.via] || s.via,
                    meta: [s.userName || 'Anonymous', formatTime(s.timestamp)],
                  }))}
                />
              )}

              {tab === 'requests' && (
                <DetailRows
                  empty="No requests posted."
                  rows={data.requests.map((r) => ({
                    title: songTitleLabel(r.songTitle, r.timestamp),
                    meta: [r.userName || 'Anonymous', formatTime(r.timestamp)],
                  }))}
                />
              )}

              {tab === 'singWithMe' && (
                <DetailRows
                  empty="No sing-with-me activity."
                  rows={data.singWithMe.map((s) => ({
                    title: songTitleLabel(s.songTitle, s.timestamp),
                    badge: SWM_LABELS[s.kind] || s.kind,
                    meta: [s.userName || 'Anonymous', formatTime(s.timestamp)],
                  }))}
                />
              )}

              {tab === 'layout' && (
                data.layout ? (
                  <LayoutPreview
                    display={data.layout.display}
                    host={data.layout.host}
                    displaySaves={data.layout.displaySaves}
                    hostSaves={data.layout.hostSaves}
                  />
                ) : (
                  <p className={styles.detailEmpty}>
                    No layout recorded for this room.
                  </p>
                )
              )}
            </div>

            {c && (
              <div className={styles.detailFooter}>
                {c.reactions} reactions · {c.searches} searches
                {' · '}
                <span
                  className={styles.langChip}
                  title={roomLanguageTitle(data.languages)}
                >
                  {roomLanguageLabel(data.languages)}
                </span>
                {data.fairRotation && (
                  <>
                    {' · '}
                    <span
                      className={`${styles.fairChip} ${
                        data.fairRotation.final === true ? styles.fairChipOn : ''
                      }`}
                      title={fairTitle(data.fairRotation)}
                    >
                      {fairLabel(data.fairRotation)}
                    </span>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default RoomDetail;
