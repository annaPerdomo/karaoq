import * as React from 'react';
import AdminLogin from './admin/AdminLogin';
import AdminShell from './admin/AdminShell';
import RoomsView from './admin/rooms/RoomsView';
import ErrorsView from './admin/errors/ErrorsView';
import SuggestionsView from './admin/SuggestionsView';
import PulseView from './admin/pulse/PulseView';
import FeedbackView from './admin/FeedbackView';
import type { AdminView, AnalyticsData, ErrorsData } from './admin/types';
import { viewerTimezone } from './admin/format';

const SECRET_KEY = 'karaoq_analytics_secret';

const Admin = (): React.ReactElement => {
  const [secret, setSecret] = React.useState('');
  const [authenticated, setAuthenticated] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [errors, setErrors] = React.useState<ErrorsData | null>(null);
  const [errorsLoading, setErrorsLoading] = React.useState(false);
  const [view, setView] = React.useState<AdminView>('rooms');
  const [roomsQuery, setRoomsQuery] = React.useState('');
  const [feedbackUnhandled, setFeedbackUnhandled] = React.useState(0);
  // RoomsView owns its own paged list, so Refresh has to reach it explicitly.
  const [refreshToken, setRefreshToken] = React.useState(0);

  const fetchErrors = React.useCallback(async (s: string) => {
    setErrorsLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/errors?tz=${encodeURIComponent(viewerTimezone())}`,
        { headers: { 'x-analytics-secret': s } }
      );
      if (!res.ok) throw new Error('Failed to load errors');
      setErrors(await res.json());
    } catch {
      setErrors(null);
    }
    setErrorsLoading(false);
  }, []);

  const fetchData = React.useCallback(
    async (s: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/analytics/data?tz=${encodeURIComponent(viewerTimezone())}`,
          { headers: { 'x-analytics-secret': s } }
        );
        if (res.status === 401) {
          setError('Invalid secret');
          setAuthenticated(false);
          setData(null);
          localStorage.removeItem(SECRET_KEY);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error('Failed to load analytics');
        setData(await res.json());
        setAuthenticated(true);
        localStorage.setItem(SECRET_KEY, s);
        fetchErrors(s);
        // Count only: the badge has to be right before the tab is ever opened.
        fetch('/api/analytics/feedback?limit=1', {
          headers: { 'x-analytics-secret': s },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j) setFeedbackUnhandled(j.unhandled);
          })
          .catch(() => {});
      } catch {
        setError('Failed to load analytics data');
      }
      setLoading(false);
    },
    [fetchErrors]
  );

  React.useEffect(() => {
    const saved = localStorage.getItem(SECRET_KEY);
    if (saved) {
      setSecret(saved);
      fetchData(saved);
    }
  }, [fetchData]);

  function handleLogout() {
    localStorage.removeItem(SECRET_KEY);
    setAuthenticated(false);
    setData(null);
    setErrors(null);
    setSecret('');
    setView('rooms');
    setRoomsQuery('');
  }

  /** An error group's room chip jumps straight to that room's dossier. */
  function openRoom(roomId: string) {
    setRoomsQuery(roomId);
    setView('rooms');
  }

  if (!authenticated || !data) {
    return (
      <AdminLogin
        secret={secret}
        loading={loading}
        error={!authenticated ? error : null}
        onSecretChange={setSecret}
        onSubmit={() => fetchData(secret.trim())}
      />
    );
  }

  return (
    <AdminShell
      view={view}
      badges={{
        errors: errors?.totals.last24h ?? 0,
        feedback: feedbackUnhandled,
      }}
      refreshing={loading}
      generatedAt={data.meta?.generatedAt ?? null}
      onNavigate={setView}
      onRefresh={() => {
        fetchData(secret);
        setRefreshToken((n) => n + 1);
      }}
      onLogout={handleLogout}
    >
      {view === 'rooms' && (
        <RoomsView
          secret={secret}
          query={roomsQuery}
          refreshToken={refreshToken}
          onQueryChange={setRoomsQuery}
          onMutate={() => {
            fetchData(secret);
          }}
        />
      )}
      {view === 'errors' && (
        <ErrorsView
          errors={errors}
          searchHealth={data.searchHealth}
          loading={errorsLoading}
          onRetry={() => fetchErrors(secret)}
          onOpenRoom={openRoom}
        />
      )}
      {view === 'suggestions' && <SuggestionsView data={data} />}
      {view === 'pulse' && <PulseView data={data} />}
      {view === 'feedback' && (
        <FeedbackView secret={secret} onUnhandledChange={setFeedbackUnhandled} />
      )}
    </AdminShell>
  );
};

export default Admin;
