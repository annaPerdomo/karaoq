import * as React from 'react';

import styles from '../../styles/SocialBoards.module.css';
import { useT } from '../../lib/i18n/I18nProvider';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}

// The −/+ number picker used for the singer counts on a "Sing with me" post.
const Stepper: React.FC<StepperProps> = ({ label, value, min, max, onChange }) => {
  const { t } = useT();
  return (
    <div className={styles.stepper}>
      <span className={styles.stepperLabel}>{label}</span>
      <div className={styles.stepperControls}>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={t('boards.decrease', { label })}
        >
          −
        </button>
        <span className={styles.stepperValue}>{value}</span>
        <button
          className={styles.stepperBtn}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={t('boards.increase', { label })}
        >
          +
        </button>
      </div>
    </div>
  );
};

export default Stepper;
