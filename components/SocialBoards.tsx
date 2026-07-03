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

type PreviewTarget =
  | { kind: 'singwithme'; post: SingWithMePost }
  | { kind: 'suggestion'; post: SuggestedSong };

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
  // Whether the draft's video preview is playing (in the post modal).
  const [draftPlaying, setDraftPlaying] = React.useState(false);

  // Preview state, shared between both boards — lets people confirm which
  // cover/version was posted before joining or claiming it.
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [previewPlaying, setPreviewPlaying] = React.useState(false);

  const name = userName.trim();

  function closeModal() {
    setPosting(null);
    setPicked(null);
    setAnonymous(false);
    setMinSingers(2);
    setMaxSingers(4);
    setDraftPlaying(false);
  }

  function pickSong(song: YoutubeResult | null) {
    setPicked(song);
    setDraftPlaying(false);
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

  function openPreview(target: PreviewTarget) {
    setPreviewPlaying(false);
    setPreview(target);
  }

  async function handleClaimFromPreview() {
    if (!preview || preview.kind !== 'suggestion') return;
    await handleClaim(preview.post);
    setPreview(null);
  }

  async function handleJoinFromPreview() {
    if (!preview || preview.kind !== 'singwithme') return;
    await handleJoin(preview.post);
    setPreview(null);
  }

  async function handleRemoveSwm(post: SingWithMePost) {
    setBusy(true);
    // Host moderation removes with no name; a singer must prove they're the poster.
    const ok = await removeSingWithMe(roomId, post.id, isHost ? undefined : name);
    setBusy(false);
    if (ok) onChange?.();
  }

  async function handleRemoveSuggestion(s: SuggestedSong) {
    setBusy(true);
    const ok = await removeSuggestion(roomId, s.id, isHost ? undefined : name);
    setBusy(false);
    if (ok) onChange?.();
  }

  // A singer can back out of their own *named* posts. Anonymous posts have no
  // recorded owner to match against, so those stay host-only to remove.
  function ownsSwm(post: SingWithMePost) {
    return !isHost && !post.anonymous && !!name && post.createdBy === name;
  }
  function ownsSuggestion(s: SuggestedSong) {
    return !isHost && !s.anonymous && !!name && s.suggestedBy === name;
  }

  return (
    <div className={styles.boards}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'singwithme' ? styles.tabActive : ''}`}
          onClick={() => setTab('singwithme')}
        >
          Sing together
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
                  : 'Post a duet or group number and gather people to sing it together!'}
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
                  <button
                    className={styles.previewBtn}
                    onClick={() => openPreview({ kind: 'singwithme', post })}
                    aria-label="Preview this song"
                    title="Preview this song"
                  >
                    <span className={styles.previewBtnIcon}>▶</span> Preview
                  </button>
                  {isHost ? (
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemoveSwm(post)}
                      disabled={busy}
                      aria-label="Remove post"
                    >
                      ×
                    </button>
                  ) : ownsSwm(post) ? (
                    <button
                      className={styles.removeBtn}
                      onClick={() => handleRemoveSwm(post)}
                      disabled={busy}
                      aria-label="Remove your post"
                      title="Remove your post"
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
                <button
                  className={styles.previewBtn}
                  onClick={() => openPreview({ kind: 'suggestion', post: s })}
                  aria-label="Preview this song"
                  title="Preview this song"
                >
                  <span className={styles.previewBtnIcon}>▶</span> Preview
                </button>
                {isHost ? (
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveSuggestion(s)}
                    disabled={busy}
                    aria-label="Remove suggestion"
                  >
                    ×
                  </button>
                ) : ownsSuggestion(s) ? (
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveSuggestion(s)}
                    disabled={busy}
                    aria-label="Remove your suggestion"
                    title="Remove your suggestion"
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
                {posting === 'singwithme' ? 'Sing together' : 'Suggest a song'}
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
                onPick={pickSong}
              />
            ) : (
              <div className={styles.draft}>
                <div className={styles.previewWrap}>
                  {draftPlaying ? (
                    <iframe
                      className={styles.previewFrame}
                      src={`https://www.youtube.com/embed/${picked.videoId}?autoplay=1&rel=0`}
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.previewPlayBtn}
                      onClick={() => setDraftPlaying(true)}
                      title="Play preview"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail */}
                      <img src={picked.thumbnailUrl} alt="" className={styles.previewThumb} />
                      <span className={styles.previewPlayIcon}>▶</span>
                    </button>
                  )}
                </div>
                <p className={styles.draftSong}>{picked.title}</p>
                <button className={styles.changeBtn} onClick={() => pickSong(null)}>
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

      {/* Preview modal */}
      {preview && (() => {
        const previewJoined = preview.kind === 'singwithme' ? preview.post.joinedSingers.length : 0;
        const previewAlreadyIn =
          preview.kind === 'singwithme' && !!name && preview.post.joinedSingers.includes(name);
        const previewFull = preview.kind === 'singwithme' && previewJoined >= preview.post.maxSingers;

        return (
          <div className={styles.overlay} onClick={() => setPreview(null)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Preview</h3>
                <button
                  className={styles.modalClose}
                  onClick={() => setPreview(null)}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <div className={styles.draft}>
                <div className={styles.previewWrap}>
                  {previewPlaying ? (
                    <iframe
                      className={styles.previewFrame}
                      src={`https://www.youtube.com/embed/${preview.post.videoId}?autoplay=1&rel=0`}
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.previewPlayBtn}
                      onClick={() => setPreviewPlaying(true)}
                      title="Play preview"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnail; Next optimization adds cost/latency without benefit */}
                      <img
                        src={`https://i.ytimg.com/vi/${preview.post.videoId}/hqdefault.jpg`}
                        alt=""
                        className={styles.previewThumb}
                      />
                      <span className={styles.previewPlayIcon}>▶</span>
                    </button>
                  )}
                </div>
                <p className={styles.draftSong}>{decodeHtml(preview.post.songTitle)}</p>

                {!isHost && preview.kind === 'suggestion' && (
                  <button
                    className={styles.submitBtn}
                    onClick={handleClaimFromPreview}
                    disabled={busy || !name}
                    title={!name ? 'Enter your name first' : undefined}
                  >
                    I&apos;ll sing this
                  </button>
                )}

                {!isHost && preview.kind === 'singwithme' && (
                  <button
                    className={styles.submitBtn}
                    onClick={handleJoinFromPreview}
                    disabled={busy || previewAlreadyIn || previewFull || !name}
                    title={!name ? 'Enter your name first' : undefined}
                  >
                    {previewAlreadyIn ? '✓ Joined' : previewFull ? 'Full' : 'Join'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
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
