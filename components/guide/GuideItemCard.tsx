import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { withAffiliateTag, type Guide } from '../../lib/guides';

interface GuideItemCardProps {
  guide: Guide;
  /** 1-based index into `guide.items`; copy lives at `guide.<id>.item<n>.*`. */
  n: number;
}

/**
 * One external resource: linked name + one-line rationale. Affiliate entries
 * need rel="sponsored nofollow" — required by search engines and the FTC.
 */
const GuideItemCard = ({ guide, n }: GuideItemCardProps): React.ReactElement | null => {
  const { t } = useT();
  const item = guide.items?.[n - 1];
  if (!item) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);

  return (
    <li className={styles.item}>
      <a
        href={withAffiliateTag(item.href)}
        target="_blank"
        rel={item.sponsored ? 'sponsored nofollow noopener' : 'noopener'}
        className={styles.itemName}
      >
        {g(`item${n}.name`)}
        <span className={styles.itemArrow} aria-hidden="true">↗</span>
      </a>
      <p className={styles.itemBody}>{g(`item${n}.body`)}</p>
    </li>
  );
};

export default GuideItemCard;
