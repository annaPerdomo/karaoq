import * as React from 'react';

import styles from '../../styles/Guide.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { hasSponsoredItems, withAffiliateTag, type Guide } from '../../lib/guides';

interface GuideItemListProps {
  guide: Guide;
}

/**
 * External-resource list section (gear picks, YouTube channels). Copy comes
 * from `guide.<id>.itemN.name/.body`; the URLs live in lib/guides.ts. Affiliate
 * entries get rel="sponsored nofollow" and pull the shared disclosure line in
 * above the list — both are required for search engines and the FTC.
 */
const GuideItemList = ({ guide }: GuideItemListProps): React.ReactElement | null => {
  const { t } = useT();
  const items = guide.items ?? [];
  if (items.length === 0) return null;

  const g = (suffix: string) => t(`guide.${guide.id}.${suffix}`);

  return (
    <section className={styles.items}>
      <h2 className={styles.itemsHeading}>{g('itemsHeading')}</h2>
      <p className={styles.itemsIntro}>{g('itemsIntro')}</p>
      {hasSponsoredItems(guide) && (
        <p className={styles.disclosure}>{t('guide.affiliateDisclosure')}</p>
      )}
      <ol className={styles.itemList}>
        {items.map((item, i) => {
          const n = i + 1;
          return (
            <li key={n} className={styles.item}>
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
        })}
      </ol>
    </section>
  );
};

export default GuideItemList;
