import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { indices, type Guide } from '../../lib/guides';
import GuideDemo from './GuideDemo';
import GuideInlineItems from './GuideInlineItems';

interface GuideStepsProps {
  guide: Guide;
}

/** Numbered how-to steps (mirrored by the HowTo JSON-LD), each with its gear picks inline;
 *  the "create a room" step also carries the demo film. */
const GuideSteps = ({ guide }: GuideStepsProps): React.ReactElement | null => {
  const { t } = useT();
  if (guide.stepCount === 0) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);

  return (
    <>
      <h2 className={styles.stepsHeading}>{t('guide.stepsHeading')}</h2>
      <ol className={styles.steps}>
        {indices(guide.stepCount).map((n) => (
          <li key={n} className={styles.step}>
            <span className={styles.stepNum} aria-hidden="true">{n}</span>
            <div className={styles.stepBody}>
              <h3 className={styles.stepTitle}>{g(`step${n}.title`)}</h3>
              <p className={styles.stepText}>{g(`step${n}.body`)}</p>
              {guide.demoStep === n && <GuideDemo />}
              <GuideInlineItems guide={guide} where="step" n={n} />
            </div>
          </li>
        ))}
      </ol>
    </>
  );
};

export default GuideSteps;
