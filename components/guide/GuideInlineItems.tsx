import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { firstSponsoredPlacement, placedItemIndices, type Guide } from '../../lib/guides';
import GuideItemCard from './GuideItemCard';

interface GuideInlineItemsProps {
  guide: Guide;
  where: 'section' | 'step';
  n: number;
}

/**
 * The product links for one section or step. The disclosure renders once per
 * page, above the first sponsored group — GuideItemList carries it otherwise.
 */
const GuideInlineItems = ({ guide, where, n }: GuideInlineItemsProps): React.ReactElement | null => {
  const { t } = useT();
  const items = placedItemIndices(guide, where, n);
  if (items.length === 0) return null;

  const first = firstSponsoredPlacement(guide);
  const showDisclosure = first?.where === where && first.n === n;
  // Nested under a step's own h3, so it drops a level; a section's title is h2.
  const Heading = where === 'step' ? 'h4' : 'h3';

  return (
    <div className={styles.inlineItems}>
      <Heading className={styles.inlineItemsHeading}>{t('guide.buyHeading')}</Heading>
      {showDisclosure && <p className={styles.disclosure}>{t('guide.affiliateDisclosure')}</p>}
      <ul className={styles.itemList}>
        {items.map((i) => (
          <GuideItemCard key={i} guide={guide} n={i} />
        ))}
      </ul>
    </div>
  );
};

export default GuideInlineItems;
