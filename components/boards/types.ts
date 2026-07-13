import { SingWithMePost, SuggestedSong } from '../../pages/api/types';

export type BoardTab = 'singwithme' | 'suggestions';

// What the shared preview modal is currently showing. The two boards preview
// the same way but offer a different action (join vs. claim), so the kind is
// carried alongside the post.
export type PreviewTarget =
  | { kind: 'singwithme'; post: SingWithMePost }
  | { kind: 'suggestion'; post: SuggestedSong };
