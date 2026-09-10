import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import {
  deviceLabel,
  formatTime,
  languageLabel,
  locationLabel,
  songTitleLabel,
  SWM_LABELS,
  type Person,
  type RequestRow,
  type SingWithMeRow,
} from '../roomDetailLabels';

export function DossierRow({
  title,
  badge,
  badgeClass,
  meta,
}: {
  title: string;
  badge?: string;
  badgeClass?: string;
  meta: (string | null)[];
}): React.ReactElement {
  return (
    <div className={styles.dsRow}>
      <div className={styles.dsRowMain}>
        <span className={styles.dsRowTitle} title={title}>{title}</span>
        {badge && (
          <span className={`${styles.dsBadge} ${badgeClass ?? ''}`}>{badge}</span>
        )}
      </div>
      <div className={styles.dsRowMeta}>
        {meta.filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

export function Section({
  title,
  count,
  extra,
  wide,
  children,
}: {
  title: string;
  count?: number;
  /** Second header badge, e.g. the timeline's error count. */
  extra?: React.ReactNode;
  /** Span the full dossier width instead of one grid column. */
  wide?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className={`${styles.dsSection} ${wide ? styles.dsSectionWide : ''}`}>
      <h3 className={styles.dsSectionTitle}>
        {title}
        {typeof count === 'number' && (
          <span className={styles.dsSectionCount}>{count}</span>
        )}
        {extra}
      </h3>
      {children}
    </section>
  );
}

export function PeopleSection({
  people,
  wide,
}: {
  people: Person[];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section title="People" count={people.length} wide={wide}>
      {people.length === 0 ? (
        <p className={styles.dsEmpty}>No one joined this room.</p>
      ) : (
        <div className={styles.dsRows}>
          {people.map((p, i) => (
            <DossierRow
              key={i}
              title={p.userName || 'Anonymous'}
              badge={p.role ?? undefined}
              badgeClass={p.role === 'host' ? styles.dsBadgeHost : undefined}
              meta={[
                locationLabel(p),
                deviceLabel(p),
                languageLabel(p),
                formatTime(p.firstSeen),
              ]}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

export function BoardsSection({
  requests,
  singWithMe,
  wide,
}: {
  requests: RequestRow[];
  singWithMe: SingWithMeRow[];
  wide?: boolean;
}): React.ReactElement {
  return (
    <Section
      title="Requests & sing with me"
      count={requests.length + singWithMe.length}
      wide={wide}
    >
      <div className={styles.dsRows}>
        {requests.map((r, i) => (
          <DossierRow
            key={`req-${i}`}
            title={songTitleLabel(r.songTitle, r.timestamp)}
            badge="Request"
            meta={[r.userName || 'Anonymous', formatTime(r.timestamp)]}
          />
        ))}
        {singWithMe.map((s, i) => (
          <DossierRow
            key={`swm-${i}`}
            title={songTitleLabel(s.songTitle, s.timestamp)}
            badge={`Sing with me · ${SWM_LABELS[s.kind] || s.kind}`}
            meta={[s.userName || 'Anonymous', formatTime(s.timestamp)]}
          />
        ))}
      </div>
    </Section>
  );
}
