import * as React from 'react';
import styles from '../../styles/Display.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import LanguageSwitcher from '../LanguageSwitcher';
import ClubLogo from '../brand/ClubLogo';
import { CornerHandle } from '../edit/EditChrome';
import { useScalarDrag } from '../edit/hooks/useScalarDrag';
import { roundLogoScale } from '../../lib/brandStyle';
import { LOGO_SCALE_MAX, LOGO_SCALE_MIN } from '../../lib/limits';
import { Icons } from '../host/icons';

export default function DisplayHeader({
  joinCode,
  logo,
  logoScale,
  onLogoScaleChange,
  editing,
  sidebarCollapsed,
  showCustomize,
  onCustomize,
}: {
  joinCode: string;
  logo: string | undefined;
  logoScale: number;
  onLogoScaleChange: (scale: number) => void;
  editing: boolean;
  sidebarCollapsed: boolean;
  showCustomize: boolean;
  onCustomize: () => void;
}) {
  const { t } = useT();
  const logoDrag = useScalarDrag({
    value: logoScale,
    min: LOGO_SCALE_MIN,
    max: LOGO_SCALE_MAX,
    scale: 80,
    step: 0.1,
    round: roundLogoScale,
    onChange: onLogoScaleChange,
  });
  return (
    <header className={`${styles.header} ${sidebarCollapsed ? styles.headerNoSidebar : ''}`}>
      <span className={styles.logoWrap}>
        <ClubLogo
          roomId={joinCode}
          logo={logo}
          className={styles.clubLogo}
          dividerClassName={styles.clubDivider}
        />
        {editing && logo && (
          <CornerHandle
            title={t('customize.dragResize')}
            ariaLabel={t('edit.handle.logoSize')}
            dragProps={logoDrag}
          />
        )}
      </span>
      <div className={styles.brand}>KaraoQ</div>
      <div className={styles.headerActions}>
        {showCustomize && (
          <button
            className={styles.headerEdit}
            onClick={onCustomize}
            title={t('customize.button')}
            data-remote="customize"
          >
            {Icons.brush}
            <span>{t('customize.button')}</span>
          </button>
        )}
        <LanguageSwitcher className={styles.headerLang} />
      </div>
    </header>
  );
}
