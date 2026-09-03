import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { indices, type Guide } from '../../lib/guides';

interface GuideSectionsProps {
  guide: Guide;
}

const GuideSections = ({ guide }: GuideSectionsProps): React.ReactElement | null => {
  const { t } = useT();
  if (guide.sectionCount === 0) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);

  return (
    <div className={styles.sections}>
      {indices(guide.sectionCount).map((n) => (
        <section key={n} id={`sec-${n}`} className={styles.section}>
          <h2 className={styles.sectionTitle}>{g(`sec${n}.title`)}</h2>
          {g(`sec${n}.body`)
            .split(/\n\s*\n/)
            .map((para, i) => (
              <p key={i} className={styles.sectionText}>{para}</p>
            ))}
        </section>
      ))}
    </div>
  );
};

export default GuideSections;
