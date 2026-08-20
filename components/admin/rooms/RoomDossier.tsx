import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomDossierData } from '../types';
import {
  fairLabel,
  fairTitle,
  formatTime,
  roomLanguageLabel,
  roomLanguageTitle,
} from '../roomDetailLabels';
import { BoardsSection, PeopleSection, TimelineSection } from './DossierSections';
import { CheersPanel, SetupPanel } from './DossierPanels';
import SuggestionsSection from './SuggestionsSection';

function spanLabel(span: RoomDossierData['span']): string | null {
  if (!span) return null;
  const first = new Date(span.first).getTime();
  const last = new Date(span.last).getTime();
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
  const minutes = Math.round((last - first) / 60_000);
  const length =
    minutes < 60
      ? `${minutes}m`
      : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  return `${formatTime(span.first)} → ${formatTime(span.last)} (${length})`;
}

/** Sections that would be empty collapse into muted chips, not blank panels. */
export default function RoomDossier({
  roomId,
  secret,
}: {
  roomId: string;
  secret: string;
}): React.ReactElement {
  const [data, setData] = React.useState<RoomDossierData | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    setFailed(false);
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
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, secret]);

  if (failed) {
    return <p className={styles.dossierEmpty}>Couldn&rsquo;t load room details.</p>;
  }
  if (!data) {
    return <p className={styles.dossierEmpty}>Loading the dossier…</p>;
  }

  const span = spanLabel(data.span ?? null);
  const hasCheers = (data.cheers?.total ?? 0) > 0;
  const hasBoards = data.requests.length + data.singWithMe.length > 0;
  const customized = Boolean(data.layout?.display || data.layout?.host);
  const hasSetup = customized || data.fairRotation.toggles.length > 0;
  const hasSuggestions = (data.suggestions?.length ?? 0) > 0;

  const quiet = [
    !hasCheers && 'no cheers',
    !hasBoards && 'no board activity',
    (data.errors?.length ?? 0) === 0 &&
      (data.searchFails?.length ?? 0) === 0 &&
      'no errors',
    !customized && 'default layout',
  ].filter(Boolean) as string[];

  return (
    <div className={styles.dossier}>
      <div className={styles.dossierStrip}>
        {span && <span className={styles.dossierChip}>{span}</span>}
        {data.sessionEnd && data.sessionEnd.minutesFromNow !== null && (
          <span
            className={styles.dossierChip}
            title={`Set ${formatTime(data.sessionEnd.timestamp)}`}
          >
            Wrap-up set: {data.sessionEnd.minutesFromNow}m out
          </span>
        )}
        <span className={styles.dossierChip} title={fairTitle(data.fairRotation)}>
          {fairLabel(data.fairRotation)}
        </span>
        <span className={styles.dossierChip} title={roomLanguageTitle(data.languages)}>
          {roomLanguageLabel(data.languages)}
        </span>
        <span className={styles.dossierChip}>
          {data.counts.searches} searches
        </span>
        {quiet.length > 0 && (
          <span className={`${styles.dossierChip} ${styles.dossierChipQuiet}`}>
            {quiet.join(' · ')}
          </span>
        )}
      </div>

      <div className={styles.dossierGrid}>
        <TimelineSection
          songs={data.songs}
          errors={data.errors ?? []}
          errorTotal={data.counts.errors ?? data.errors?.length ?? 0}
          searchFails={data.searchFails ?? []}
        />
        <PeopleSection people={data.people} wide={!hasCheers} />
        {hasCheers && data.cheers && <CheersPanel cheers={data.cheers} />}
        {hasBoards && (
          <BoardsSection
            requests={data.requests}
            singWithMe={data.singWithMe}
            wide={!hasSetup}
          />
        )}
        {hasSetup && (
          <SetupPanel
            layout={data.layout}
            fair={data.fairRotation}
            wide={!hasBoards}
          />
        )}
        {hasSuggestions && (
          <SuggestionsSection suggestions={data.suggestions ?? []} wide />
        )}
      </div>
    </div>
  );
}
