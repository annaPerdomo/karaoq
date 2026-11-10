import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { RoomBrand } from '../../../pages/api/types';
import { logoUrl } from '../../../lib/logoUrl';
import { Section } from './DossierSections';

export function hasBrand(brand: RoomBrand | null | undefined): brand is RoomBrand {
  return Boolean(brand && (brand.logo || brand.accentA || brand.accentB));
}

function swatches(brand: RoomBrand): { label: string; hex: string }[] {
  return [
    brand.accentA ? { label: 'Accent 1', hex: brand.accentA } : null,
    brand.accentB ? { label: 'Accent 2', hex: brand.accentB } : null,
  ].filter((s): s is { label: string; hex: string } => s !== null);
}

export function BrandMark({
  roomId,
  brand,
}: {
  roomId: string;
  brand: RoomBrand;
}): React.ReactElement {
  return (
    <span className={styles.brandMark}>
      {brand.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.brandMarkLogo}
          src={logoUrl(roomId, brand.logo)}
          alt={`Logo uploaded in room ${roomId}`}
          loading="lazy"
        />
      )}
      {swatches(brand).map((s) => (
        <span
          key={s.label}
          className={styles.brandDot}
          style={{ background: s.hex }}
          role="img"
          aria-label={`${s.label} ${s.hex}`}
          title={`${s.label} ${s.hex}`}
        />
      ))}
    </span>
  );
}

export function BrandPanel({
  roomId,
  brand,
  wide,
}: {
  roomId: string;
  brand: RoomBrand;
  wide?: boolean;
}): React.ReactElement {
  const colors = swatches(brand);
  return (
    <Section title="Branding" wide={wide}>
      <div className={styles.brandPanel}>
        {brand.logo ? (
          <a
            className={styles.brandLogoFrame}
            href={logoUrl(roomId, brand.logo)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open the logo at full size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl(roomId, brand.logo)} alt={`Logo uploaded in room ${roomId}`} />
          </a>
        ) : (
          <p className={styles.dsNote}>No logo, colors only.</p>
        )}
        <div className={styles.brandSwatches}>
          {colors.map((s) => (
            <span key={s.label} className={styles.brandSwatch}>
              <span
                className={styles.brandSwatchChip}
                style={{ background: s.hex }}
                aria-hidden="true"
              />
              <span>
                {s.label}
                <span className={styles.brandHex}>{s.hex}</span>
              </span>
            </span>
          ))}
          {colors.length === 0 && <p className={styles.dsNote}>Theme colors kept.</p>}
          {brand.logo && brand.logoScale !== undefined && (
            <p className={styles.dsNote}>Logo resized to {brand.logoScale}×.</p>
          )}
        </div>
      </div>
    </Section>
  );
}
