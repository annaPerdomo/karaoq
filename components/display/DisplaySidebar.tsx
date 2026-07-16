import * as React from 'react';
import styles from '../../styles/Display.module.css';
import QrJoinCard from '../QrJoinCard';
import BoardsSummary from '../boards/BoardsSummary';
import UpNextList from './UpNextList';
import { DisplayConfig, QueueEntry, SidebarSection, SingWithMePost, SuggestedSong } from '../../pages/api/types';
import { useT } from '../../lib/i18n/I18nProvider';

interface DisplaySidebarProps {
  joinUrl: string;
  joinCode: string;
  origin: string;
  upNext: QueueEntry[];
  boardsOn: boolean;
  singWithMe: SingWithMePost[];
  suggestions: SuggestedSong[];
  displayConfig: DisplayConfig;
}

const DisplaySidebar = ({
  joinUrl,
  joinCode,
  origin,
  upNext,
  boardsOn,
  singWithMe,
  suggestions,
  displayConfig,
}: DisplaySidebarProps): React.ReactElement => {
  const { t } = useT();
  const { qrSize, qrPx, showUpNext, upNextCount, welcomeLine, sidebarOrder } = displayConfig;

  // Host-dragged section order; hidden sections simply render nothing.
  const sections: Record<SidebarSection, React.ReactNode> = {
    qr: qrSize !== 'hidden' && (
      <QrJoinCard
        key="qr"
        joinUrl={joinUrl}
        joinCode={joinCode || ''}
        origin={origin}
        size={qrSize}
        sizePx={qrPx}
      />
    ),
    welcome: welcomeLine && (
      <p key="welcome" className={styles.welcomeLine}>{welcomeLine}</p>
    ),
    upNext: showUpNext && (
      <UpNextList key="upNext" upNext={upNext} upNextCount={upNextCount} />
    ),
  };

  return (
    <div className={styles.sidebar}>
      {sidebarOrder.map((section) => sections[section])}

      {boardsOn && (
        <BoardsSummary
          singWithMe={singWithMe}
          suggestions={suggestions}
          cta={t('display.boards.cta')}
        />
      )}
    </div>
  );
};

export default DisplaySidebar;
