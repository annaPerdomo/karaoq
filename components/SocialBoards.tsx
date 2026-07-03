import * as React from 'react';

import styles from '../styles/SocialBoards.module.css';
import SongSearch from './SongSearch';
import { YoutubeResult } from '../app/queue/searchYoutube';
import postSingWithMe from '../app/queue/postSingWithMe';
import joinSingWithMe from '../app/queue/joinSingWithMe';
import removeSingWithMe from '../app/queue/removeSingWithMe';
import postSuggestion from '../app/queue/postSuggestion';
import claimSuggestion from '../app/queue/claimSuggestion';
import removeSuggestion from '../app/queue/removeSuggestion';
import { SingWithMePost, SuggestedSong } from '../pages/api/types';

function decodeHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

type BoardTab = 'singwithme' | 'suggestions';

interface SocialBoardsProps {
  roomId: string;
  userName: string;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  /** Singer mode is interactive; host mode is read-only with moderation. */
  mode?: 'singer' | 'host';
  /** Called after a successful write so the parent can re-poll immediately. */
  onChange?: () => void;
}

const SocialBoards: React.FC<SocialBoardsProps> = ({
  roomId,
  userName,
  singWithMe,
  suggestions,
  mode = 'singer',
  onChange,
}) => {
  const isHost = mode === 'host';
  const [tab, setTab] = React.useState<BoardTab>('singwithme');
  const [posting, setPosting] = React.useState<BoardTab | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Draft state for the "post" modals.
  const [picked, setPicked] = React.useState<YoutubeResult | null>(null);
  const [anonymous, setAnonymous] = React.useState(false);
  const [minSingers, setMinSingers] = React.useState(2);
  const [maxSingers, setMaxSingers] = React.useState(4);

  const name = userName.trim();

  function closeModal() {
    setPosting(null);
    setPicked(null);
    setAnonymous(false);
    setMinSingers(2);
    setMaxSingers(4);
  }

  async function submitSingWithMe() {
    if (!picked || busy) return;
    setBusy(true);
    const ok = await postSingWithMe(roomId, {
      songTitle: picked.title,
      videoId: picked.videoId,
      createdBy: name,
      anonymous,
      minSingers,
      maxSingers: Math.max(minSingers, maxSingers),
    });
    setBusy(false);
    if (ok) {
      closeModal();
      onChange?.();
    }
  }

  async function submitSuggestion() {
    if (!picked || busy) return;
    setBusy(true);
    const ok = await postSuggestion(roomId, {
      songTitle: picked.title,
      videoId: picked.videoId,
      suggestedBy: name,
      anonymous,
    });
    setBusy(false);
    if (ok) {
      closeModal();
      onChange?.();
    }
  }

  async function handleJoin(post: SingWithMePost) {
    if (!name || busy) return;
    setBusy(true);
    const ok = await joinSingWithMe(roomId, post.id, name);
    setBusy(false);
    if (ok) onChange?.();
  }

  async function handleClaim(s: SuggestedSong) {
    if (!name || busy) return;
    setBusy(true);
    const ok = await claimSuggestion(roomId, s.id, name);
    setBusy(false);
    if (ok) onChange?.();
  }

  async function handleRemoveSwm(post: SingWithMePost) {
    setBusy(true);
    const ok = await removeSingWithMe(roomId, post.id);
    setBusy(false);
    if (ok) onChange?.();
  }

  async function handleRemoveSuggestion(s: SuggestedSong) {
    setBusy(true);
    const ok = await removeSuggestion(roomId, s.id);
    setBusy(false);
    if (ok) onChange?.();
  }

  return (
    <div className={styles.boards}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'singwithme' ? styles.tabActive : ''}`}
          onClick={() => setTab('singwithme')}
        >
          Sing with me
          {singWithMe.length > 0 && <span className={styles.tabCount}>{singWithMe.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === 'suggestions' ? styles.tabActive : ''}`}
          onClick={() => setTab('suggestions')}
        >
          Suggestions
          {suggestions.length > 0 && <span className={styles.tabCount}>{suggestions.length}</span>}
        </button>
      </div>

      {tab === 'singwithme' ? (
        <div className={styles.list}>
          {!isHost && (
            <button className={styles.postBtn} onClick={() => setPosting('singwithme')}>
              + Post a song to sing together
            </button>
          )}
          {singWithMe.length === 0 ? (
            <div className={styles.empty}>
              <p>No open songs yet</p>
              <span>
                {isHost
                  ? 'Singers can post a song and gather people to sing it together.'
                  : 'Post a duet or group number and gather people to sing it with you!'}
              </span>
            </div>
          ) : (
            singWithMe.map((post) => {
              const joined = post.joinedSingers.length;
              const alreadyIn = !!name && post.joinedSingers.includes(name);
              const full = joined >= post.maxSingers;
              return (
                <div key={post.id} className={styles.card}>
                  <div className={styles.cardMain}>
                    <span className={styles.cardSong}>{decodeHtml(post.songTitle)}</span>
                    {/* A named poster already leads the "Singing:" list below,
                        so only call out anonymous posts. */}
                    {(post.anonymous || !post.createdBy) && (
                      <span className={styles.cardMeta}>posted anonymously</span>
                    )}
                    <div className={styles.progressRow}>
                      <span className={styles.progressText}>
                        {!post.queued
                          ? `needs ${post.minSingers - joined} more singer${post.minSingers - joined === 1 ? '' : 's'}`
                          : full
                          ? `${joined} singers · full`
                          : `${joined} singers · room for ${post.maxSingers - joined} more`}
                      </span>
                      {post.queued && <span className={styles.queuedBadge}>In queue 🎶</span>}
                    </div>
                    {post.joinedSingers.length > 0 && (
                      <span className={styles.joinedNames}>
                        Singing: {post.joinedSingers.join(', ')}
                      </span>
                    )}
                  </div>
                  {isHost ? (
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemoveSwm(post)}
                      disabled={busy}
                      aria-label="Remove post"
                    >
                      ×
                    </button>
                  ) : (
                    <button
                      className={`${styles.joinBtn} ${alreadyIn ? styles.joinBtnDone : ''}`}
                      onClick={() => handleJoin(post)}
                      disabled={busy || alreadyIn || full || !name}
                      title={!name ? 'Enter your name first' : undefined}
                    >
                      {alreadyIn ? '✓ Joined' : full ? 'Full' : 'Join'}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {!isHost && (
            <button className={styles.postBtn} onClick={() => setPosting('suggestions')}>
              + Suggest a song for someone
            </button>
          )}
          {suggestions.length === 0 ? (
            <div className={styles.empty}>
              <p>No suggestions yet</p>
              <span>
                {isHost
                  ? 'Singers can suggest songs for anyone in the room to pick up.'
                  : 'Too shy to sing? Suggest a song and someone else can grab it.'}
              </span>
            </div>
          ) : (
            suggestions.map((s) => (
              <div key={s.id} className={styles.card}>
                <div className={styles.cardMain}>
                  <span className={styles.cardSong}>{decodeHtml(s.songTitle)}</span>
                  <span className={styles.cardMeta}>
                    from {s.anonymous || !s.suggestedBy ? 'Anonymous' : s.suggestedBy}
                  </span>
                </div>
                {isHost ? (
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveSuggestion(s)}
                    disabled={busy}
                    aria-label="Remove suggestion"
                  >
                    ×
                  </button>
                ) : (
                  <button
                    className={styles.joinBtn}
                    onClick={() => handleClaim(s)}
                    disabled={busy || !name}
                    title={!name ? 'Enter your name first' : undefined}
                  >
                    I&apos;ll sing this
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Post modal (singer only) */}
      {posting && (
        <div className={styles.overlay} onClick={closeModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                {posting === 'singwithme' ? 'Sing with me' : 'Suggest a song'}
              </h3>
              <button className={styles.modalClose} onClick={closeModal} aria-label="Close">
                ×
              </button>
            </div>

            {!picked ? (
              <SongSearch
                roomId={roomId}
                userName={name}
                onSongAdded={() => {}}
                showFilters={false}
                onPick={setPicked}
              />
            ) : (
              <div className={styles.draft}>
                {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
                <img src={picked.thumbnailUrl} alt="" className={styles.draftThumb} />
                <p className={styles.draftSong}>{picked.title}</p>
                <button className={styles.changeBtn} onClick={() => setPicked(null)}>
                  Choose a different song
                </button>

                {posting === 'singwithme' && (
                  <div className={styles.stepperRow}>
                    <Stepper
                      label="Singers needed"
                      value={minSingers}
                      min={2}
                      max={20}
                      onChange={(v) => {
                        setMinSingers(v);
                        if (v > maxSingers) setMaxSingers(v);
                      }}
                    />
                    <Stepper
                      label="Max singers"
                      value={Math.max(minSingers, maxSingers)}
                      min={minSingers}
                      max={20}
                      onChange={setMaxSingers}
                    />
                  </div>
                )}

                <label className={styles.anonRow}>
                  <input
                    type="checkbox"
                    checked={anonymous}
                    onChange={(e) => setAnonymous(e.target.checked)}
                  />
                  Post anonymously
                </label>

                <button
                  className={styles.submitBtn}
                  onClick={posting === 'singwithme' ? submitSingWithMe : submitSuggestion}
                  disabled={busy}
                >
                  {posting === 'singwithme' ? 'Post it' : 'Suggest it'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

const Stepper: React.FC<StepperProps> = ({ label, value, min, max, onChange }) => (
  <div className={styles.stepper}>
    <span className={styles.stepperLabel}>{label}</span>
    <div className={styles.stepperControls}>
      <button
        className={styles.stepperBtn}
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        −
      </button>
      <span className={styles.stepperValue}>{value}</span>
      <button
        className={styles.stepperBtn}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        +
      </button>
    </div>
  </div>
);

export default SocialBoards;
