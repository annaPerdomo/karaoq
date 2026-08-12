import * as React from 'react';
import styles from '../../styles/Admin.module.css';

export default function AdminLogin({
  secret,
  loading,
  error,
  onSecretChange,
  onSubmit,
}: {
  secret: string;
  loading: boolean;
  error: string | null;
  onSecretChange: (value: string) => void;
  onSubmit: () => void;
}): React.ReactElement {
  return (
    <main className={styles.loginMain}>
      <div className={styles.loginCard}>
        <span className={styles.loginBrand}>KaraoQ</span>
        <h1 className={styles.loginTitle}>Mission Control</h1>
        <p className={styles.loginHint}>
          Rooms, errors, and everything the party left behind.
        </p>
        <form
          className={styles.loginForm}
          onSubmit={(e) => {
            e.preventDefault();
            if (secret.trim()) onSubmit();
          }}
        >
          <input
            type="password"
            value={secret}
            onChange={(e) => onSecretChange(e.target.value)}
            placeholder="Analytics secret"
            className={styles.loginInput}
            autoFocus
          />
          <button type="submit" className={styles.loginButton} disabled={loading}>
            {loading ? 'Unlocking…' : 'Enter'}
          </button>
        </form>
        {error && <p className={styles.loginError}>{error}</p>}
      </div>
    </main>
  );
}
