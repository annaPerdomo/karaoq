import Link from 'next/link';
import * as React from 'react';
import { useT } from '../../lib/i18n/I18nProvider';

/** Footer link to the maker note. Opens a new tab so a guest or host mid-night
 * never loses their room by tapping it. */
export default function TipJarLink({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <Link href="/support" target="_blank" rel="noopener" className={className}>
      {t('support.footerLink')}
    </Link>
  );
}
