import * as React from 'react';
import styles from '../../styles/Home.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

const HeroBrandMark = React.forwardRef<HTMLDivElement>(function HeroBrandMark(_props, ref) {
  const { t } = useT();
  return (
    <div className={styles.brandMark} ref={ref}>
      <span className={styles.brandWord}>KaraoQ</span>
      {/* Hidden whole: screen readers announce the interpuncts as punctuation
          right after the brand — "kar dot uh dot oh dot kyoo". */}
      <span className={styles.brandPhonetic} aria-hidden="true">
        / {t('home.hero.brandPhonetic')} /
      </span>
    </div>
  );
});

export default HeroBrandMark;
