import * as React from 'react';
import styles from '../../styles/Host.module.css';
import b from './BrandControls.module.css';
import { useT } from '../../lib/i18n/I18nProvider';
import { logoUrl } from '../../lib/logoUrl';
import { prepareLogo } from '../../lib/logoImage';
import { THEME_ACCENTS } from '../../lib/brandStyle';
import { RailCard } from '../edit/Rail';
import { uploadLogo } from '../../app/queue/brand';
import postScreenEvent from '../../app/queue/screenEvent';
import { DisplayTheme, RoomBrand } from '../../pages/api/types';

const ERROR_KEYS: Record<string, string> = {
  type: 'brand.error.type',
  size: 'brand.error.size',
  full: 'brand.error.full',
};

export interface BrandControlsProps {
  roomId: string;
  brand: RoomBrand;
  onChange: (next: RoomBrand) => void;
  /** True while a logo upload is in flight; the surface blocks Save meanwhile. */
  onBusyChange?: (busy: boolean) => void;
  /** Prefills the colour pickers while the brand leaves them unset. */
  theme?: DisplayTheme;
}

/** The brand section of both Customize rails. The uploaded logo stays a draft until Save. */
export default function BrandControls({
  roomId,
  brand,
  onChange,
  onBusyChange,
  theme = 'classic',
}: BrandControlsProps) {
  const { t } = useT();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const accents = THEME_ACCENTS[theme];
  // A colour picked while the upload runs must survive it.
  const brandRef = React.useRef(brand);
  brandRef.current = brand;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Lets the same file be picked again after an error.
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploading(true);
    onBusyChange?.(true);
    try {
      const dataUrl = await prepareLogo(file);
      const { hash } = await uploadLogo(roomId, dataUrl);
      onChange({ ...brandRef.current, logo: hash });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      // Only prepareLogo throws these; the server counts its own rejections.
      if (code === 'type' || code === 'size') {
        postScreenEvent(roomId, 'logo_upload_rejected', { reason: code });
      }
      setError(ERROR_KEYS[code] ?? 'brand.error.upload');
    } finally {
      setUploading(false);
      onBusyChange?.(false);
    }
  }

  return (
    <RailCard<string> selected={null} onSelect={() => {}}>
      <div className={styles.spLabel}>{t('brand.title')}</div>
      <div className={b.logoRow}>
        <div className={b.thumb}>
          {/* eslint-disable-next-line @next/next/no-img-element -- immutable-cached logo route; the optimizer would re-serve it at a cost */}
          {brand.logo && <img src={logoUrl(roomId, brand.logo)} alt={t('brand.logoAlt')} />}
        </div>
        <div className={`${styles.dpSegmented} ${b.logoActions}`}>
          <button
            className={styles.dpSegmentBtn}
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {brand.logo ? t('brand.replace') : t('brand.upload')}
          </button>
          {brand.logo && (
            <button
              className={styles.dpSegmentBtn}
              disabled={uploading}
              onClick={() => onChange({ ...brand, logo: undefined, logoScale: undefined })}
            >
              {t('brand.remove')}
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          className={b.fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={uploading}
          onChange={handleFile}
          data-testid="brand-file"
        />
      </div>
      {error && (
        <div className={b.error} role="alert">
          {t(error)}
        </div>
      )}

      <div className={b.colorRow}>
        <label className={b.colorField}>
          <input
            type="color"
            value={brand.accentA ?? accents.accentA}
            onChange={(e) => onChange({ ...brand, accentA: e.target.value })}
          />
          {t('brand.accentA')}
        </label>
        <label className={b.colorField}>
          <input
            type="color"
            value={brand.accentB ?? accents.accentB}
            onChange={(e) => onChange({ ...brand, accentB: e.target.value })}
          />
          {t('brand.accentB')}
        </label>
      </div>
      <div className={`${styles.dpSegmented} ${b.resetRow}`}>
        <button
          className={styles.dpSegmentBtn}
          disabled={!brand.accentA && !brand.accentB}
          onClick={() => onChange({ ...brand, accentA: undefined, accentB: undefined })}
        >
          {t('brand.useTheme')}
        </button>
      </div>
    </RailCard>
  );
}
