import * as React from 'react';

import styles from '../../styles/Analytics.module.css';
import type { FeedbackKind } from '../../pages/api/types';

const PAGE_SIZE = 50;

export interface FeedbackRow {
  _id: string;
  kind: FeedbackKind;
  message: string;
  contact: string;
  roomId?: string;
  role?: 'host' | 'singer';
  page?: string;
  locale?: string;
  country?: string;
  userAgent?: string;
  handled?: boolean;
  createdAt: string;
}

type Filter = 'unhandled' | 'all' | FeedbackKind;

const FILTERS: Filter[] = ['unhandled', 'all', 'bug', 'idea', 'other'];

const KIND_LABEL: Record<FeedbackKind, string> = {
  bug: '🐞 Bug',
  idea: '💡 Idea',
  other: '💬 Other',
};

/** Filtering the fetched page instead would render "nothing to triage" while
 * unhandled reports sit unread behind it. */
function filterQuery(filter: Filter): string {
  if (filter === 'all') return '';
  if (filter === 'unhandled') return '&handled=false';
  return `&kind=${filter}`;
}

/** `contact` is free text from the public form, and mailto swallows
 * `?bcc=`/`?body=` — only linkify what could plausibly be an address. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function shortDevice(ua: string | undefined): string | null {
  if (!ua) return null;
  if (/iPhone|iPad/.test(ua)) return /iPad/.test(ua) ? 'iPad' : 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'Other';
}

export function FeedbackPanel({
  secret,
  onUnhandledChange,
}: {
  secret: string;
  /** Keeps the tab badge in step as rows are ticked off here. */
  onUnhandledChange?: (count: number) => void;
}): React.ReactElement {
  const [items, setItems] = React.useState<FeedbackRow[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [filter, setFilter] = React.useState<Filter>('unhandled');
  const [unhandled, setUnhandled] = React.useState(0);

  // Through a ref so an inline parent callback can't change `load`'s identity —
  // that would retrigger the mount effect on every render.
  const notifyRef = React.useRef(onUnhandledChange);
  React.useEffect(() => {
    notifyRef.current = onUnhandledChange;
  }, [onUnhandledChange]);

  const load = React.useCallback(
    async (skip: number, replace: boolean) => {
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(
          `/api/analytics/feedback?skip=${skip}&limit=${PAGE_SIZE}${filterQuery(filter)}`,
          { headers: { 'x-analytics-secret': secret } }
        );
        if (!res.ok) throw new Error('Failed to load feedback');
        const json = (await res.json()) as {
          items: FeedbackRow[];
          hasMore: boolean;
          unhandled: number;
        };
        setItems((prev) => (replace ? json.items : [...prev, ...json.items]));
        setHasMore(json.hasMore);
        setUnhandled(json.unhandled);
        notifyRef.current?.(json.unhandled);
      } catch {
        setFailed(true);
      }
      setLoading(false);
    },
    [secret, filter]
  );

  React.useEffect(() => {
    load(0, true);
  }, [load]);

  async function toggleHandled(row: FeedbackRow) {
    const handled = !row.handled;
    // Optimistic: the only cost of a failed write is a stale tick until refresh.
    setItems((prev) =>
      prev.map((r) => (r._id === row._id ? { ...r, handled } : r))
    );
    const nextUnhandled = Math.max(0, unhandled + (handled ? -1 : 1));
    setUnhandled(nextUnhandled);
    notifyRef.current?.(nextUnhandled);
    try {
      await fetch('/api/analytics/feedback', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-analytics-secret': secret,
        },
        body: JSON.stringify({ id: row._id, handled }),
      });
    } catch {
      /* the next load reconciles */
    }
  }

  return (
    <div className={styles.tabContent}>
      <div className={styles.fbFilters}>
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`${styles.fbFilter} ${filter === f ? styles.fbFilterActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <button
          className={styles.fbRefresh}
          onClick={() => load(0, true)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {failed && (
        <div className={styles.errorBanner}>
          <span>Failed to load feedback</span>
          <button className={styles.retryBtn} onClick={() => load(0, true)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !failed && items.length === 0 && (
        <div className={styles.empty}>
          {filter === 'all'
            ? 'No feedback yet.'
            : 'Nothing matches this filter.'}
        </div>
      )}

      <div className={styles.fbList}>
        {items.map((row) => {
          const device = shortDevice(row.userAgent);
          return (
            <article
              key={row._id}
              className={`${styles.fbCard} ${row.handled ? styles.fbCardHandled : ''}`}
            >
              <header className={styles.fbCardHead}>
                <span className={styles.fbKind}>{KIND_LABEL[row.kind]}</span>
                <span className={styles.fbWhen}>{formatWhen(row.createdAt)}</span>
                <button
                  className={styles.fbHandle}
                  onClick={() => toggleHandled(row)}
                >
                  {row.handled ? '✓ Handled' : 'Mark handled'}
                </button>
              </header>

              <p className={styles.fbMessage}>{row.message}</p>

              <footer className={styles.fbMeta}>
                {row.contact &&
                  (EMAIL_RE.test(row.contact) ? (
                    <a
                      className={styles.fbContact}
                      href={`mailto:${encodeURIComponent(row.contact)}`}
                    >
                      {row.contact}
                    </a>
                  ) : (
                    <span className={styles.fbContact}>{row.contact}</span>
                  ))}
                {row.roomId && <span>Room {row.roomId.toUpperCase()}</span>}
                {row.role && <span>{row.role}</span>}
                {row.page && <span>{row.page}</span>}
                {row.locale && <span>{row.locale}</span>}
                {row.country && <span>{row.country}</span>}
                {device && <span>{device}</span>}
              </footer>
            </article>
          );
        })}
      </div>

      {hasMore && (
        <button
          className={styles.fbMore}
          onClick={() => load(items.length, false)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default FeedbackPanel;
