import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';

import ReleaseArticle from '../../components/whatsnew/ReleaseArticle';
import WhatsNewHead from '../../components/whatsnew/WhatsNewHead';
import { useT } from '../../lib/i18n/I18nProvider';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, isLocale, type Locale } from '../../lib/i18n/config';
import { localeStaticProps, type LocaleStaticProps } from '../../lib/i18n/staticCatalog';
import { RELEASE_SLUGS, releaseBySlug, releaseUrl } from '../../lib/releases';
import {
  releaseShareImage,
  releasePostingSchema,
  releaseVideoSchemas,
  whatsNewBreadcrumb,
} from '../../lib/releaseSchema';

interface ReleasePageProps {
  slug: string;
  pageLocale: Locale;
}

const ReleasePage: NextPage<ReleasePageProps> = ({ slug, pageLocale }) => {
  const { t } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;
  const release = releaseBySlug(slug);
  if (!release) return null;

  return (
    <>
      <WhatsNewHead
        locale={loc}
        title={t(`release.${release.id}.title`)}
        description={t(`release.${release.id}.metaDesc`)}
        urlFor={(l) => releaseUrl(slug, l)}
        ogType="article"
        image={releaseShareImage(release)}
        jsonLd={[
          releasePostingSchema(release, loc, t),
          ...releaseVideoSchemas(release, loc, t),
          whatsNewBreadcrumb(loc, t, release),
        ]}
      />
      <ReleaseArticle release={release} locale={loc} />
    </>
  );
};

// Dynamic routes don't fan out across locales on their own — enumerate every
// `/{locale}/whats-new/{slug}` or the hreflang targets 404 under fallback:false.
export const getStaticPaths: GetStaticPaths = async () => ({
  paths: RELEASE_SLUGS.flatMap((slug) =>
    SUPPORTED_LOCALES.map((locale) => ({ params: { slug }, locale }))
  ),
  fallback: false,
});

export const getStaticProps: GetStaticProps<ReleasePageProps & LocaleStaticProps> = async ({
  params,
  locale,
}) => {
  const slug = String(params?.slug ?? '');
  if (!releaseBySlug(slug)) return { notFound: true };
  return { props: { slug, ...localeStaticProps(locale) } };
};

export default ReleasePage;
