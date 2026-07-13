import * as React from 'react';

import styles from '../styles/SocialBoards.module.css';
import SingWithMeCard from './boards/SingWithMeCard';
import SuggestionCard from './boards/SuggestionCard';
import BoardPostModal, { BoardDraft } from './boards/BoardPostModal';
import BoardPreviewModal from './boards/BoardPreviewModal';
import { BoardTab, PreviewTarget } from './boards/types';
import postSingWithMe from '../app/queue/postSingWithMe';
import joinSingWithMe from '../app/queue/joinSingWithMe';
import removeSingWithMe from '../app/queue/removeSingWithMe';
import editSingWithMe from '../app/queue/editSingWithMe';
import postSuggestion from '../app/queue/postSuggestion';
import claimSuggestion from '../app/queue/claimSuggestion';
import removeSuggestion from '../app/queue/removeSuggestion';
import editSuggestion from '../app/queue/editSuggestion';
import { SingWithMePost, SuggestedSong } from '../pages/api/types';
import { useT } from '../lib/i18n/I18nProvider';

interface SocialBoardsProps {
  roomId: string;
  userName: string;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  /** Host mode adds moderation — editing and removing anyone's post. */
  mode?: 'singer' | 'host';
  /** Called after a successful write so the parent can re-poll immediately. */
  onChange?: () => void;
}

// The two boards as a tabbed panel. Owns the writes and the open-modal state;
// the cards and modals are presentational.
const SocialBoards: React.FC<SocialBoardsProps> = ({
  roomId,
  userName,
  singWithMe,
  suggestions,
  mode = 'singer',
  onChange,
}) => {
  const isHost = mode === 'host';
  const { t } = useT();
  const [tab, setTab] = React.useState<BoardTab>('singwithme');
  const [posting, setPosting] = React.useState<BoardTab | null>(null);
  const [editing, setEditing] = React.useState<PreviewTarget | null>(null);
  const [preview, setPreview] = React.useState<PreviewTarget | null>(null);
  const [busy, setBusy] = React.useState(false);

  const name = userName.trim();

  async function run(action: () => Promise<boolean>, onOk?: () => void) {
    if (busy) return;
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) {
      onOk?.();
      onChange?.();
    }
  }

  // Awaited, so the preview stays open (with its button disabled) until the
  // join/claim lands — closing early would hide a failure.
  async function actFromPreview() {
    if (!preview) return;
    if (preview.kind === 'singwithme') await handleJoin(preview.post);
    else await handleClaim(preview.post);
    setPreview(null);
  }

  function submitPost(draft: BoardDraft) {
    const forSingWithMe = posting === 'singwithme';
    run(
      () =>
        forSingWithMe
          ? postSingWithMe(roomId, {
              songTitle: draft.song.title,
              videoId: draft.song.videoId,
              createdBy: name,
              anonymous: draft.anonymous,
              minSingers: draft.minSingers,
              maxSingers: draft.maxSingers,
            })
          : postSuggestion(roomId, {
              songTitle: draft.song.title,
              videoId: draft.song.videoId,
              suggestedBy: name,
              anonymous: draft.anonymous,
            }),
      () => setPosting(null)
    );
  }

  function submitEdit(draft: BoardDraft) {
    if (!editing) return;
    const target = editing;
    run(
      () =>
        target.kind === 'singwithme'
          ? editSingWithMe(roomId, target.post.id, {
              songTitle: draft.song.title,
              videoId: draft.song.videoId,
              minSingers: draft.minSingers,
              maxSingers: draft.maxSingers,
              userName: isHost ? undefined : name,
            })
          : editSuggestion(roomId, target.post.id, {
              songTitle: draft.song.title,
              videoId: draft.song.videoId,
              userName: isHost ? undefined : name,
            }),
      () => setEditing(null)
    );
  }

  // Only the video id is stored, so rebuild YouTube's thumbnail URL rather than
  // re-running a search just to show the preview frame.
  function editDraft(target: PreviewTarget): BoardDraft {
    const swm = target.kind === 'singwithme' ? target.post : null;
    return {
      song: {
        title: target.post.songTitle,
        videoId: target.post.videoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${target.post.videoId}/mqdefault.jpg`,
      },
      anonymous: target.post.anonymous,
      minSingers: swm?.minSingers ?? 2,
      maxSingers: swm?.maxSingers ?? 4,
    };
  }

  function handleJoin(post: SingWithMePost) {
    if (!name) return;
    return run(() => joinSingWithMe(roomId, post.id, name));
  }

  function handleClaim(s: SuggestedSong) {
    if (!name) return;
    return run(() => claimSuggestion(roomId, s.id, name));
  }

  // Host moderation acts with no name; anyone else must prove they're the poster
  // (the server enforces it). Same split on the edit routes above.
  function handleRemoveSwm(post: SingWithMePost) {
    run(() => removeSingWithMe(roomId, post.id, isHost ? undefined : name));
  }

  function handleRemoveSuggestion(s: SuggestedSong) {
    run(() => removeSuggestion(roomId, s.id, isHost ? undefined : name));
  }

  // Anyone — host included — can back out of their own *named* posts.
  // Anonymous posts have no recorded owner to match against, so those stay
  // moderation-only to remove.
  function ownsSwm(post: SingWithMePost) {
    return !post.anonymous && !!name && post.createdBy === name;
  }
  function ownsSuggestion(s: SuggestedSong) {
    return !s.anonymous && !!name && s.suggestedBy === name;
  }

  return (
    <div className={styles.boards}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'singwithme' ? styles.tabActive : ''}`}
          onClick={() => setTab('singwithme')}
        >
          {t('boards.tab.singTogether')}
          {singWithMe.length > 0 && <span className={styles.tabCount}>{singWithMe.length}</span>}
        </button>
        <button
          className={`${styles.tab} ${tab === 'suggestions' ? styles.tabActive : ''}`}
          onClick={() => setTab('suggestions')}
        >
          {t('boards.tab.requests')}
          {suggestions.length > 0 && <span className={styles.tabCount}>{suggestions.length}</span>}
        </button>
      </div>

      {tab === 'singwithme' ? (
        <div className={styles.list}>
          <button className={styles.postBtn} onClick={() => setPosting('singwithme')}>
            {t('boards.post.singTogether')}
          </button>
          {singWithMe.length === 0 ? (
            <div className={styles.empty}>
              <p>{t('boards.empty.swm.title')}</p>
              <span>{t('boards.empty.swm.singer')}</span>
            </div>
          ) : (
            singWithMe.map((post) => (
              <SingWithMeCard
                key={post.id}
                post={post}
                isHost={isHost}
                isOwn={ownsSwm(post)}
                name={name}
                busy={busy}
                onJoin={() => handleJoin(post)}
                onEdit={() => setEditing({ kind: 'singwithme', post })}
                onRemove={() => handleRemoveSwm(post)}
                onPreview={() => setPreview({ kind: 'singwithme', post })}
              />
            ))
          )}
        </div>
      ) : (
        <div className={styles.list}>
          <button className={styles.postBtn} onClick={() => setPosting('suggestions')}>
            {t('boards.post.request')}
          </button>
          {suggestions.length === 0 ? (
            <div className={styles.empty}>
              <p>{t('boards.empty.req.title')}</p>
              <span>{t('boards.empty.req.singer')}</span>
            </div>
          ) : (
            suggestions.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                isHost={isHost}
                isOwn={ownsSuggestion(s)}
                name={name}
                busy={busy}
                onClaim={() => handleClaim(s)}
                onEdit={() => setEditing({ kind: 'suggestion', post: s })}
                onRemove={() => handleRemoveSuggestion(s)}
                onPreview={() => setPreview({ kind: 'suggestion', post: s })}
              />
            ))
          )}
        </div>
      )}

      {posting && (
        <BoardPostModal
          tab={posting}
          roomId={roomId}
          name={name}
          busy={busy}
          onSubmit={submitPost}
          onClose={() => setPosting(null)}
        />
      )}

      {editing && (
        <BoardPostModal
          tab={editing.kind === 'singwithme' ? 'singwithme' : 'suggestions'}
          roomId={roomId}
          name={name}
          busy={busy}
          initial={editDraft(editing)}
          onSubmit={submitEdit}
          onClose={() => setEditing(null)}
        />
      )}

      {preview && (
        <BoardPreviewModal
          target={preview}
          name={name}
          busy={busy}
          onAct={actFromPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
};

export default SocialBoards;
