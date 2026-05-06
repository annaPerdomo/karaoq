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

// ─── Scroll reveal wrapper ───
function Reveal({ children, className, delay }: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${visible ? styles.revealVisible : ''} ${className || ''}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

// ─── Equalizer bars decoration ───
function EqBars({ color }: { color: string }) {
  return (
    <div className={styles.eqBars} aria-hidden="true">
      {[0, 0.2, 0.1, 0.3, 0.15].map((d, i) => (
        <span key={i} className={styles.eqBar} style={{ animationDelay: `${d}s`, background: color }} />
      ))}
    </div>
  );
}

// ─── Animated Demo: Create Room (2-frame cycle) ───
function CreateRoomDemo() {
  return (
    <div className={styles.demoScreen}>
      <div className={`${styles.demoFrame} ${styles.frame1of2}`}>
        <div className={styles.demoAppBg}>
          <div className={styles.demoLogo}>KaraoQ</div>
          <div className={styles.demoCreateCard}>
            <div className={styles.demoCreateTitle}>HOST</div>
            <div className={styles.demoCreateDesc}>Create a karaoke queue that others can join</div>
            <div className={styles.demoCreateBtn}>CREATE</div>
          </div>
          <div className={styles.demoCreateCard}>
            <div className={styles.demoCreateTitle}>PLAY</div>
            <div className={styles.demoCreateDesc}>Join a queue set up by another Host</div>
            <div className={styles.demoCreateBtn}>JOIN</div>
          </div>
        </div>
      </div>
      <div className={`${styles.demoFrame} ${styles.frame2of2}`}>
        <div className={styles.demoAppBg}>
          <div className={styles.demoLogo}>KaraoQ</div>
          <div className={styles.demoCreateCard}>
            <div className={styles.demoCreateTitle}>YOUR ROOM</div>
            <div className={styles.demoRoomCode}>X7K2M</div>
            <div className={styles.demoShareText}>Share this code with friends!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Demo: Search & Add Song (3-frame cycle) ───
function SearchSongDemo() {
  return (
    <div className={styles.demoScreen}>
      <div className={`${styles.demoFrame} ${styles.frame1of3}`}>
        <div className={styles.demoAppBg}>
          <div className={styles.demoMiniHeader}>
            <span className={styles.demoHeaderLogo}>KaraoQ</span>
            <span className={styles.demoBadge}>X7K2M</span>
          </div>
          <div className={styles.demoNameRow}>
            <span className={styles.demoLabel}>Your name</span>
            <div className={styles.demoNameInput}>Sarah</div>
          </div>
          <div className={styles.demoSearchRow}>
            <div className={styles.demoSearchInput}>
              <span className={styles.demoTyping}>golden</span>
            </div>
            <div className={styles.demoSearchBtn}>Search</div>
          </div>
          <div className={styles.demoToggleRow}>
            <span>Karaoke mode</span>
            <span className={styles.demoToggle} />
          </div>
          <div className={styles.demoEmptyState}>
            <div className={styles.demoMicIcon}>&#127908;</div>
            <div>Search for a song</div>
          </div>
        </div>
      </div>
      <div className={`${styles.demoFrame} ${styles.frame2of3}`}>
        <div className={styles.demoAppBg}>
          <div className={styles.demoMiniHeader}>
            <span className={styles.demoHeaderLogo}>KaraoQ</span>
            <span className={styles.demoBadge}>X7K2M</span>
          </div>
          <div className={styles.demoResultCard}>
            <div className={styles.demoThumb} />
            <div className={styles.demoResultInfo}>Golden - Karaoke Version</div>
            <div className={styles.demoAddBtn}>+</div>
          </div>
          <div className={styles.demoResultCard}>
            <div className={styles.demoThumb} />
            <div className={styles.demoResultInfo}>Kpop Demon Hunters - Golden (Lyrics)</div>
            <div className={styles.demoAddBtnDim}>+</div>
          </div>
          <div className={styles.demoResultCard}>
            <div className={styles.demoThumb} />
            <div className={styles.demoResultInfo}>Golden - Acoustic Karaoke</div>
            <div className={styles.demoAddBtnDim}>+</div>
          </div>
        </div>
      </div>
      <div className={`${styles.demoFrame} ${styles.frame3of3}`}>
        <div className={styles.demoAppBg}>
          <div className={styles.demoMiniHeader}>
            <span className={styles.demoHeaderLogo}>KaraoQ</span>
            <span className={styles.demoBadge}>X7K2M</span>
          </div>
          <div className={styles.demoToast}>Added &ldquo;Golden&rdquo; to the queue!</div>
          <div className={styles.demoQueuePreview}>
            <div className={styles.demoQueueLabel}>Up Next</div>
            <div className={styles.demoQueueRow}>
              <span className={styles.demoQueueNum}>1</span>
              <div>
                <div className={styles.demoQueueSong}>Bohemian Rhapsody</div>
                <div className={styles.demoQueueSinger}>Mike</div>
              </div>
            </div>
            <div className={`${styles.demoQueueRow} ${styles.demoQueueHighlight}`}>
              <span className={styles.demoQueueNum}>2</span>
              <div>
                <div className={styles.demoQueueSong}>Golden</div>
                <div className={styles.demoQueueSinger}>Sarah</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Animated Demo: Display View (video + sidebar) ───
function DisplayViewDemo() {
  return (
    <div className={styles.demoScreen}>
      <div className={styles.demoDisplayBg}>
        {/* Video area */}
        <div className={styles.demoVideoArea}>
          <div className={styles.demoVideoPlayer}>
            <div className={styles.demoVideoThumb}>
              <div className={styles.demoKaraokeLyrics}>
                <div className={styles.karaokeLine}>
                  <span className={`${styles.karaokeFill} ${styles.sweep1of5}`}>Living in a lonely world</span>
                </div>
                <div className={styles.karaokeLine}>
                  <span className={`${styles.karaokeFill} ${styles.sweep2of5}`}>She took the midnight train</span>
                </div>
                <div className={styles.karaokeLine}>
                  <span className={`${styles.karaokeFill} ${styles.sweep3of5}`}>Going anywhere</span>
                </div>
                <div className={styles.karaokeLine}>
                  <span className={`${styles.karaokeFill} ${styles.sweep4of5}`}>Just a city boy</span>
                </div>
                <div className={styles.karaokeLine}>
                  <span className={`${styles.karaokeFill} ${styles.sweep5of5}`}>Born and raised in south Detroit</span>
                </div>
              </div>
              <div className={styles.demoVideoProgress}>
                <div className={styles.demoVideoProgressFill} />
              </div>
            </div>
            <div className={styles.demoNowBar}>
              <span className={styles.demoStageDot} />
              <span className={styles.demoStageLabel}>ON STAGE</span>
              <span className={styles.demoStageName}>Mike</span>
            </div>
            <div className={styles.demoVideoTitle}>Don&apos;t Stop Believin&apos; &mdash; Journey</div>
          </div>
        </div>
        {/* Sidebar: QR + queue */}
        <div className={styles.demoDisplaySidebar}>
          <div className={styles.demoDisplayQr}>
            <div className={styles.demoQrPlaceholder} />
            <div className={styles.demoDisplayJoinLabel}>JOIN</div>
            <div className={styles.demoDisplayCode}>X7K2M</div>
          </div>
          <div className={styles.demoDisplayQueue}>
            <div className={styles.demoDisplayQueueTitle}>Up Next</div>
            <div className={styles.demoDisplayQueueItem}>
              <span className={styles.demoDisplayQueueNum}>1</span>
              <div>
                <div className={styles.demoDisplayQueueSinger}>Mike</div>
                <div className={styles.demoDisplayQueueSong}>Bohemian Rhapsody</div>
              </div>
            </div>
            <div className={styles.demoDisplayQueueItem}>
              <span className={styles.demoDisplayQueueNum}>2</span>
              <div>
                <div className={styles.demoDisplayQueueSinger}>Sarah</div>
                <div className={styles.demoDisplayQueueSong}>Golden</div>
              </div>
            </div>
            <div className={styles.demoDisplayQueueItem}>
              <span className={styles.demoDisplayQueueNum}>3</span>
              <div>
                <div className={styles.demoDisplayQueueSinger}>Jordan</div>
                <div className={styles.demoDisplayQueueSong}>Mr. Brightside</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Home / Landing Page ───
const Home = (): React.ReactElement => {
  const router = useRouter();
  const [joinCode, setJoinCode] = React.useState('');
  const [showJoin, setShowJoin] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  async function handleHost() {
    if (creating) return;
    setCreating(true);
    const code = generateCode();
    try {
      const resp = await fetch(`/api/queue/${code}`, { method: 'POST' });
      if (resp.ok) {
        router.push(`/host/${code}`);
      } else {
        setCreating(false);
      }
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
    <>
      {/* ─── Navigation ─── */}
      <nav className={styles.nav}>
        <span className={styles.navLogo}>KaraoQ</span>
        <div className={styles.navLinks}>
          <a href="#how-it-works" className={styles.navLink}>How It Works</a>
          <a href="#features" className={styles.navLink}>Features</a>
          <button className={styles.navCtaOutline} onClick={() => {
            setShowJoin(true);
            document.querySelector(`.${styles.hero}`)?.scrollIntoView({ behavior: 'smooth' });
          }}>
            Join a Session
          </button>
          <button className={styles.navCta} onClick={handleHost} disabled={creating}>
            {creating ? 'Creating...' : 'Host a Session'}
          </button>
        </div>
      </nav>

      <main>
        {/* ─── Hero ─── */}
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <div className={styles.heroContent}>
              <h1 className={styles.heroTitle}>
                YouTube Karaoke.{' '}
                <span className={styles.heroGradient}>Zero Setup.</span>
              </h1>
              <p className={styles.heroSub}>
                Turn any gathering into karaoke night. Guests pick songs from
                their phones, you control the queue &mdash; all powered by YouTube.
              </p>
              <div className={styles.heroCtas}>
                <button
                  className={styles.btnPrimary}
                  onClick={handleHost}
                  disabled={creating}
                >
                  {creating ? 'Creating...' : 'Host a Session'}
                </button>
                {!showJoin ? (
                  <button
                    className={styles.btnOutline}
                    onClick={() => setShowJoin(true)}
                  >
                    Join a Session
                  </button>
                ) : (
                  <div className={styles.joinRow}>
                    <input
                      className={styles.joinInput}
                      placeholder="ROOM CODE"
                      aria-label="Room code"
                      maxLength={5}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                      autoFocus
                    />
                    <button
                      className={styles.btnOutline}
                      onClick={handleJoin}
                      disabled={!joinCode.trim()}
                    >
                      Join
                    </button>
                  </div>
                )}
              </div>
              <p className={styles.heroNote}>No account needed. Ready in seconds.</p>
            </div>

            <div className={styles.heroDevice}>
              <div className={styles.phoneFrame}>
                <div className={styles.phoneNotch} />
                <div className={styles.phoneScreen}>
                  <SearchSongDemo />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── How It Works ─── */}
        <section id="how-it-works" className={styles.howSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>How It Works</h2>
            <p className={styles.sectionSub}>Three steps. Under a minute. That&apos;s it.</p>
          </Reveal>

          <div className={styles.steps}>
            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <div className={styles.phoneFrameSm}>
                  <div className={styles.phoneNotch} />
                  <div className={styles.phoneScreen}>
                    <CreateRoomDemo />
                  </div>
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>1</span>
                <h3 className={styles.stepTitle}>Create a Room</h3>
                <p className={styles.stepDesc}>
                  Tap one button to generate a unique room code. Share it with
                  your guests &mdash; no accounts, no downloads, no sign-ups needed.
                </p>
              </div>
            </Reveal>

            <Reveal className={`${styles.step} ${styles.stepReverse}`}>
              <div className={styles.stepDevice}>
                <div className={styles.phoneFrameSm}>
                  <div className={styles.phoneNotch} />
                  <div className={styles.phoneScreen}>
                    <SearchSongDemo />
                  </div>
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>2</span>
                <h3 className={styles.stepTitle}>Pick Your Songs</h3>
                <p className={styles.stepDesc}>
                  Guests search YouTube right from their phones and add songs to the
                  shared queue. Karaoke mode automatically finds the best versions.
                </p>
              </div>
            </Reveal>

            <Reveal className={styles.step}>
              <div className={styles.stepDevice}>
                <div className={styles.tvFrame}>
                  <div className={styles.tvScreen}>
                    <DisplayViewDemo />
                  </div>
                  <div className={styles.tvStand} />
                </div>
              </div>
              <div className={styles.stepText}>
                <span className={styles.stepNum}>3</span>
                <h3 className={styles.stepTitle}>Sing Your Heart Out</h3>
                <p className={styles.stepDesc}>
                  Open the display on any screen &mdash; TV, laptop, projector, tablet.
                  Lyrics light up as you sing. The host controls the queue while
                  a QR code lets latecomers jump in.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="features" className={styles.featuresSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>Everything You Need</h2>
            <p className={styles.sectionSub}>
              No DJ equipment. No karaoke machine. Just phones and a screen.
            </p>
          </Reveal>

          <div className={styles.featuresGrid}>
            <Reveal delay={0}>
              <div className={styles.featureCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconPulse} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <polygon points="10,8 14,11 10,14" fill="currentColor" stroke="none" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>YouTube-Powered</h3>
                <p className={styles.featureDesc}>
                  Millions of karaoke tracks at your fingertips. Search, preview,
                  and queue songs instantly from YouTube.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.featureCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconSpin} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.5 2v6h-6" />
                    <path d="M2.5 22v-6h6" />
                    <path d="M2.5 11.5a10 10 0 0 1 18.8-4.3" />
                    <path d="M21.5 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Real-Time Sync</h3>
                <p className={styles.featureDesc}>
                  Everyone sees the queue update live across all devices. No
                  refreshing needed &mdash; it just works.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.featureCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconBounce} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Cast to Any Screen</h3>
                <p className={styles.featureDesc}>
                  Any screen with a browser becomes your karaoke display &mdash;
                  TV, laptop, projector, tablet. Just open the link.
                </p>
              </div>
            </Reveal>

            <Reveal delay={0}>
              <div className={styles.featureCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconWiggle} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="8" cy="6" r="1.5" />
                    <circle cx="16" cy="6" r="1.5" />
                    <circle cx="8" cy="12" r="1.5" />
                    <circle cx="16" cy="12" r="1.5" />
                    <circle cx="8" cy="18" r="1.5" />
                    <circle cx="16" cy="18" r="1.5" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Drag &amp; Drop Queue</h3>
                <p className={styles.featureDesc}>
                  Hosts can reorder songs with a drag, move tracks to the top, or
                  remove them. Full control over the lineup.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div className={styles.featureCard} style={{ '--accent': '#10b981' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconPulse} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>No Downloads</h3>
                <p className={styles.featureDesc}>
                  Works entirely in the browser. Guests just visit the URL and enter
                  the code &mdash; that&apos;s it.
                </p>
              </div>
            </Reveal>

            <Reveal delay={200}>
              <div className={styles.featureCard} style={{ '--accent': '#3b82f6' } as React.CSSProperties}>
                <div className={styles.featureIcon}>
                  <svg className={styles.iconTilt} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="7" y="2" width="10" height="20" rx="2" />
                    <line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                </div>
                <h3 className={styles.featureTitle}>Works on Any Device</h3>
                <p className={styles.featureDesc}>
                  Phones, tablets, laptops &mdash; any device with a browser becomes
                  a karaoke remote control.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Use Cases ─── */}
        <section className={styles.useCasesSection}>
          <Reveal>
            <h2 className={styles.sectionTitle}>Where Karaoke Happens</h2>
          </Reveal>

          <div className={styles.useCasesGrid}>
            <Reveal delay={0}>
              <div className={styles.useCaseCard} style={{ '--accent': '#ec4899' } as React.CSSProperties}>
                <EqBars color="#ec4899" />
                <h3 className={styles.useCaseTitle}>House Parties</h3>
                <p className={styles.useCaseDesc}>
                  Turn your living room into a karaoke bar. Everyone picks songs
                  from their phone &mdash; no aux cord fights.
                </p>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className={styles.useCaseCard} style={{ '--accent': '#06b6d4' } as React.CSSProperties}>
                <EqBars color="#06b6d4" />
                <h3 className={styles.useCaseTitle}>Bars &amp; Venues</h3>
                <p className={styles.useCaseDesc}>
                  Run karaoke night with just a laptop and a screen. Guests queue
                  songs from their own phones.
                </p>
              </div>
            </Reveal>
            <Reveal delay={200}>
              <div className={styles.useCaseCard} style={{ '--accent': '#f97316' } as React.CSSProperties}>
                <EqBars color="#f97316" />
                <h3 className={styles.useCaseTitle}>Team Events</h3>
                <p className={styles.useCaseDesc}>
                  Nothing breaks the ice like your manager singing Bohemian Rhapsody.
                  Perfect for offsites and holiday parties.
                </p>
              </div>
            </Reveal>
            <Reveal delay={300}>
              <div className={styles.useCaseCard} style={{ '--accent': '#a855f7' } as React.CSSProperties}>
                <EqBars color="#a855f7" />
                <h3 className={styles.useCaseTitle}>Celebrations</h3>
                <p className={styles.useCaseDesc}>
                  Birthdays, graduations, weddings &mdash; dedicate the first
                  song and let the party take over.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className={styles.ctaSection}>
          <Reveal>
            <h2 className={styles.ctaTitle}>Ready to Sing?</h2>
            <p className={styles.ctaSub}>
              Start a karaoke session in seconds. No sign-up required.
            </p>
            <div className={styles.ctaButtons}>
              <button
                className={styles.btnPrimary}
                onClick={handleHost}
                disabled={creating}
              >
                {creating ? 'Creating...' : 'Host a Session'}
              </button>
              <button
                className={styles.btnOutline}
                onClick={() => {
                  setShowJoin(true);
                  document.querySelector(`.${styles.hero}`)?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Join a Session
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <a href="https://variationsonastring.com" target="_blank" rel="noopener noreferrer" className={styles.footerLink}>
            made with <span className={styles.footerHeart}>&#9829;</span> by Variations on a String
          </a>
        </div>
      </footer>
    </>
  );
};

export default Home;
