import Link from 'next/link';
import * as React from 'react';

import guideStyles from '../../styles/Guide.module.css';
import LanguageSwitcher from '../LanguageSwitcher';

const WhatsNewShell = ({ children }: { children: React.ReactNode }): React.ReactElement => (
  <div className={guideStyles.page}>
    <header className={guideStyles.topbar}>
      <Link href="/" className={guideStyles.wordmark}>KaraoQ</Link>
      <LanguageSwitcher />
    </header>
    <article className={guideStyles.article}>{children}</article>
  </div>
);

export default WhatsNewShell;
