import type { GetStaticProps, NextPage } from 'next';

import WhatsNewHead from '../../components/whatsnew/WhatsNewHead';
import WhatsNewIndex from '../../components/whatsnew/WhatsNewIndex';
import { useT } from '../../lib/i18n/I18nProvider';
import { DEFAULT_LOCALE, isLocale, type Locale } from '../../lib/i18n/config';
import { localeStaticProps, type LocaleStaticProps } from '../../lib/i18n/staticCatalog';
import { whatsNewUrl } from '../../lib/releases';
import {
  DEFAULT_OG_IMAGE,
  whatsNewBlogSchema,
  whatsNewBreadcrumb,
} from '../../lib/releaseSchema';

const WhatsNewPage: NextPage<{ pageLocale: Locale }> = ({ pageLocale }) => {
  const { t } = useT();
  const loc = isLocale(pageLocale) ? pageLocale : DEFAULT_LOCALE;

  return (
    <>
      <WhatsNewHead
        locale={loc}
        title={t('whatsNew.title')}
        description={t('whatsNew.metaDesc')}
        urlFor={whatsNewUrl}
        ogType="website"
        image={{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630 }}
        jsonLd={[whatsNewBlogSchema(loc, t), whatsNewBreadcrumb(loc, t)]}
      />
      <WhatsNewIndex locale={loc} />
    </>
  );
};

export const getStaticProps: GetStaticProps<LocaleStaticProps> = async ({ locale }) => ({
  props: localeStaticProps(locale),
});

export default WhatsNewPage;
