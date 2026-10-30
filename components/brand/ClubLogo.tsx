import * as React from 'react';
import { useT } from '../../lib/i18n/I18nProvider';
import { logoUrl } from '../../lib/logoUrl';

/** The venue's logo, or nothing: one that fails to load hides with its divider. */
export default function ClubLogo({
  roomId,
  logo,
  className,
  dividerClassName,
}: {
  roomId: string;
  logo: string | undefined;
  className: string;
  dividerClassName?: string;
}) {
  const { t } = useT();
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [logo]);
  if (!logo || failed) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- immutable-cached logo route; the optimizer would re-serve it at a cost */}
      <img
        className={className}
        src={logoUrl(roomId, logo)}
        alt={t('brand.logoAlt')}
        onError={() => setFailed(true)}
      />
      {dividerClassName && <span className={dividerClassName} aria-hidden="true" />}
    </>
  );
}
