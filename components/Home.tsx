import { useRouter } from 'next/router';
import * as React from 'react';
import styles from '../styles/Home.module.css';

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const Home = (): React.ReactElement => {
  const router = useRouter();
  const [joinCode, setJoinCode] = React.useState('');
  const [hostCode, setHostCode] = React.useState<string | null>(null);
  const [showJoin, setShowJoin] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  function handleHost() {
    setHostCode(generateCode());
  }

  async function startHosting() {
    if (!hostCode) return;
    setCreating(true);
    try {
      await fetch(`/api/queue/${hostCode}`, { method: 'POST' });
      router.push(`/host/${hostCode}`);
    } catch {
      setCreating(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code) {
      router.push(`/sing/${code}`);
    }
  }

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>KaraoQ</h1>
      <p className={styles.subtitle}>Your one stop shop for YouTube Karaoke!</p>

      <div className={styles.cards}>
        {/* HOST card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>HOST</h2>
          <p className={styles.cardDesc}>
            Create a Karaoke queue that other people can join
          </p>
          {!hostCode ? (
            <button className={styles.btn} onClick={handleHost}>
              CREATE
            </button>
          ) : (
            <div className={styles.codeReveal}>
              <span className={styles.codeLabel}>Your room code</span>
              <span className={styles.code}>{hostCode}</span>
              <button
                className={styles.btn}
                onClick={startHosting}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'START'}
              </button>
            </div>
          )}
        </div>

        {/* PLAY card */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>PLAY</h2>
          <p className={styles.cardDesc}>
            Join a pre-existing queue set up by another Host
          </p>
          {!showJoin ? (
            <button
              className={styles.btn}
              onClick={() => setShowJoin(true)}
            >
              JOIN
            </button>
          ) : (
            <div className={styles.codeReveal}>
              <label className={styles.inputLabel}>Enter Code</label>
              <input
                className={styles.codeInput}
                maxLength={5}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                autoFocus
              />
              <button
                className={styles.btn}
                onClick={handleJoin}
                disabled={!joinCode.trim()}
              >
                JOIN
              </button>
            </div>
          )}
        </div>

        {/* EXPLORE card - TODO: Add in a way for people to fill the dead time if there are no songs picked */}
        {/* <div className={styles.card}>
          <h2 className={styles.cardTitle}>EXPLORE</h2>
          <p className={styles.cardDesc}>
            Find new Playlists and Music to keep the party going
          </p>
          <button className={styles.btn}>
            BEGIN
          </button>
        </div> */}
      </div>
    </main>
  );
};

export default Home;
