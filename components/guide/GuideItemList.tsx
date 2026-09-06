import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { firstSponsoredPlacement, unplacedItemIndices, type Guide } from '../../lib/guides';
import GuideItemCard from './GuideItemCard';

interface GuideItemListProps {
  guide: Guide;
}

/**
 * Foot-of-article list of the items placed nowhere inline. The disclosure
 * renders once per page, so it shows here only when no inline group carried it.
 */
const GuideItemList = ({ guide }: GuideItemListProps): React.ReactElement | null => {
  const { t } = useT();
  const items = unplacedItemIndices(guide);
  if (items.length === 0) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);
  const sponsored = items.some((i) => guide.items?.[i - 1]?.sponsored);
  const showDisclosure = sponsored && firstSponsoredPlacement(guide) === null;

  return (
    <section className={styles.items}>
      <h2 className={styles.itemsHeading}>{g('itemsHeading')}</h2>
      <p className={styles.itemsIntro}>{g('itemsIntro')}</p>
      {showDisclosure && <p className={styles.disclosure}>{t('guide.affiliateDisclosure')}</p>}
      <ol className={styles.itemList}>
        {items.map((i) => (
          <GuideItemCard key={i} guide={guide} n={i} />
        ))}
      </ol>
    </section>
  );
};

export default GuideItemList;
