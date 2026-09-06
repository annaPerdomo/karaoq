import Link from 'next/link';
import { useRouter } from 'next/router';
import * as React from 'react';

import styles from '../styles/Guide.module.css';
import { useT } from '../lib/i18n/I18nProvider';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../lib/i18n/config';
import { GUIDES, guideById, type Guide } from '../lib/guides';
import GuideFaq from './guide/GuideFaq';
import GuideItemList from './guide/GuideItemList';
import GuideSections from './guide/GuideSections';
import GuideSteps from './guide/GuideSteps';
import LanguageSwitcher from './LanguageSwitcher';

interface GuideArticleProps {
  /** The guide this page renders (its `id` namespaces every `guide.<id>.*` key). */
  guideId: string;
}

/**
 * A single query-targeted guide article. Every string comes from the i18n
 * catalog via t(), so the same component renders in all ten locales — and the
 * visible copy matches the HowTo/Article JSON-LD emitted alongside it (both are
 * sourced from `guide.<id>.*`). Cross-links to sibling guides + a prominent CTA
 * back into the room-creation flow keep crawlers and readers moving through the
 * site rather than bouncing off a leaf page.
 */
const GuideArticle = ({ guideId }: GuideArticleProps): React.ReactElement => {
  const { t, locale: uiLocale } = useT();
  const router = useRouter();
  const locale: Locale = isLocale(router.locale) ? router.locale : DEFAULT_LOCALE;
  const guide: Guide | undefined = guideById(guideId);

  const g = (suffix: string) => t(`guide.${guideId}.${suffix}`);
  const related = (guide?.related ?? [])
    .map((id) => GUIDES.find((x) => x.id === id))
    .filter(Boolean) as Guide[];

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.wordmark}>KaraoQ</Link>
        <LanguageSwitcher />
      </header>

      <article className={styles.article}>
        <Link href="/" className={styles.back}>
          <span aria-hidden="true">←</span> {t('guide.backHome')}
        </Link>

        <p className={styles.eyebrow}>{t('guide.eyebrow')}</p>
        <h1 className={styles.h1}>{g('h1')}</h1>
        <p className={styles.intro}>{g('intro')}</p>
        {guide && (
          <p className={styles.updated}>
            {t('guide.updated', {
              date: new Intl.DateTimeFormat(uiLocale, {
                year: 'numeric',
                month: 'long',
                timeZone: 'UTC',
              }).format(
                new Date(`${guide.updated}T00:00:00Z`)
              ),
            })}
          </p>
        )}

        {guide && <GuideSections guide={guide} />}

        {guide && <GuideSteps guide={guide} />}

        {guide && <GuideItemList guide={guide} />}
        {guide && <GuideFaq guide={guide} />}

        <p className={styles.closing}>{g('closing')}</p>

        <section className={styles.cta}>
          <h2 className={styles.ctaTitle}>{t('guide.ctaTitle')}</h2>
          <p className={styles.ctaSub}>{t('guide.ctaSub')}</p>
          <div className={styles.ctaButtons}>
            <Link href="/" className={styles.btnPrimary}>{t('home.nav.host')}</Link>
            <Link href="/" className={styles.btnOutline}>{t('home.nav.join')}</Link>
          </div>
        </section>

        {related.length > 0 && (
          <nav className={styles.related} aria-label={t('guide.relatedHeading')}>
            <h2 className={styles.relatedHeading}>{t('guide.relatedHeading')}</h2>
            <ul className={styles.relatedList}>
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={`/guide/${r.slug}`} locale={locale} className={styles.relatedLink}>
                    <span className={styles.relatedTitle}>{t(`guide.${r.id}.h1`)}</span>
                    <span className={styles.relatedArrow} aria-hidden="true">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </article>
    </div>
  );
};

export default GuideArticle;
