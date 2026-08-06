import { useRouter } from 'next/router';
import * as React from 'react';
import getRoom from '../app/queue/getRoom';
import {
  clearLastHostedRoom,
  getLastHostedRoom,
  rememberLastHostedRoom,
} from '../lib/lastRoom';
import styles from '../styles/Home.module.css';
import { useT } from '../lib/i18n/I18nProvider';
import LanguageSwitcher from './LanguageSwitcher';
import HeroDemo from './home/HeroDemo';
import HeroCtaCard from './home/HeroCtaCard';
import HowItWorksSection from './home/HowItWorksSection';
import SetupSection from './home/SetupSection';
import FeaturesSection from './home/FeaturesSection';
import UseCasesSection from './home/UseCasesSection';
import FaqSection from './home/FaqSection';
import HomeFooter from './home/HomeFooter';
import GlobalReach from './home/GlobalReach';
import Reveal from './home/Reveal';
import { EMPTY_STATS, type PublicStats } from '../lib/publicStats';

// Re-exported: pages/index.tsx builds its FAQPage JSON-LD from this path.
export { FAQ_ITEMS } from './home/faq';

function generateCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const CUSTOM_CODE_PATTERN = /^[A-Z0-9]{3,12}$/;

export interface HomeProps {
  /** Social-proof figures baked in by the page's ISR pass. */
  stats?: PublicStats;
}

const Home = ({ stats = EMPTY_STATS }: HomeProps): React.ReactElement => {
  const router = useRouter();
  const { t, tn } = useT();
  const [joinCode, setJoinCode] = React.useState('');
  const [showJoin, setShowJoin] = React.useState(false);
  const [showCustom, setShowCustom] = React.useState(false);
  const [customCode, setCustomCode] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [hostError, setHostError] = React.useState('');
  const [hostName, setHostName] = React.useState('');
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const [resumeRoom, setResumeRoom] = React.useState<{
    code: string;
    songCount: number;
  } | null>(null);

  // Pre-fill the host's name from a previous session so returning hosts can
  // start a queue without retyping it.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('karaoq_host_name');
      if (saved) setHostName(saved);
    } catch {}
  }, []);

  // A host coming back to the landing page mid-night tends to create a second
  // room because they lost the first — offer their recent room back instead.
  // Verified against the API so a room deleted from admin is never offered.
  React.useEffect(() => {
    const last = getLastHostedRoom();
    if (!last) return;
    let cancelled = false;
    getRoom(last.code).then((room) => {
      if (cancelled) return;
      // Only a definitive 404 clears the stored pointer. A transient
      // failure (5xx, network blip) must not destroy the resume banner —
      // that would recreate the exact duplicate-room gap it exists to close.
      if (room === "notFound") {
        clearLastHostedRoom();
        return;
      }
      if (room === "error") return;
      setResumeRoom({
        code: last.code,
        // Songs still ahead of the playhead — what "resuming" gets them.
        songCount: Math.max(0, room.queue.length - room.activeVideoIndex),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function dismissResume() {
    clearLastHostedRoom();
    setResumeRoom(null);
  }

  async function handleHost(useCustom = false) {
    if (creating) return;
    const name = hostName.trim();
    if (!name) {
      setHostError(t('home.err.enterName'));
      return;
    }
    const code = useCustom ? customCode.trim().toUpperCase() : generateCode();
    if (useCustom && !CUSTOM_CODE_PATTERN.test(code)) {
      setHostError(t('home.err.codeFormat'));
      return;
    }
    setHostError('');
    // Carry the name into the host view so the queue starts already set up.
    try {
      localStorage.setItem('karaoq_host_name', name);
    } catch {}
    setCreating(true);
    try {
      const headers: Record<string, string> = {};
      if (useCustom) headers['x-custom-code'] = '1';
      const resp = await fetch(`/api/queue/${code}`, { method: 'POST', headers });
      if (resp.ok) {
        rememberLastHostedRoom(code);
        router.push(`/host/${code}`);
      } else if (resp.status === 409) {
        setHostError(t('home.err.codeInUse'));
        setCreating(false);
      } else {
        setHostError(t('home.err.generic'));
        setCreating(false);
      }
    } catch {
      setHostError(t('home.err.generic'));
      setCreating(false);
    }
  }

  function handleJoin() {
    const code = joinCode.trim().toUpperCase();
    if (code) {
      router.push(`/sing/${code}`);
    }
  }

  function scrollToHero() {
    document
      .querySelector(`.${styles.hero}`)
      ?.scrollIntoView({ behavior: 'smooth' });
  }

  // Nav / footer "Host" CTAs: returning hosts (name already saved) get
  // one-click hosting; first-timers are sent to the hero form with the name
  // field focused, instead of a silent error.
  function handleHostCta() {
    if (creating) return;
    if (!hostName.trim()) {
      scrollToHero();
      nameInputRef.current?.focus();
      return;
    }
    handleHost(false);
  }

  function handleJoinCta() {
    setShowJoin(true);
    scrollToHero();
  }

  return (
    <>
      <nav className={styles.nav}>
        <span className={styles.navLogo}>KaraoQ</span>
        <div className={styles.navLinks}>
          <a href="#how-it-works" className={styles.navLink}>{t('home.nav.how')}</a>
          <a href="#setup" className={styles.navLink}>{t('home.nav.setup')}</a>
          <a href="#features" className={styles.navLink}>{t('home.nav.features')}</a>
          <button className={styles.navCtaOutline} onClick={handleJoinCta}>
            {t('home.nav.join')}
          </button>
          <button className={styles.navCta} onClick={handleHostCta} disabled={creating}>
            {creating ? t('home.creating') : t('home.nav.host')}
          </button>
          <LanguageSwitcher />
        </div>
      </nav>

      <main>
        <section className={styles.hero}>
          {/* Three grid blocks — copy, demo scene, CTA card. Desktop places
              copy+CTA in the left column with the scene alongside; when the
              hero stacks, DOM order puts the scene between the pitch and the
              form, so newcomers see what KaraoQ is before it asks for a name. */}
          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <h1 className={styles.heroTitle}>{t('home.hero.title')}</h1>
              <p className={styles.heroSub}>
                {t('home.hero.sub')}
              </p>
              {/* A room from earlier tonight outranks starting a new one —
                  the duplicate-room path this banner exists to close. */}
              {resumeRoom && (
                <div className={styles.resumeCard}>
                  <span className={styles.resumeDot} aria-hidden="true" />
                  <span className={styles.resumeText}>
                    {t('home.resume.open').split(/(\{code\})/).map((part, i) =>
                      part === '{code}'
                        ? <strong key={i}>{resumeRoom.code.toUpperCase()}</strong>
                        : <React.Fragment key={i}>{part}</React.Fragment>
                    )}
                    {resumeRoom.songCount > 0 &&
                      tn('home.resume.queued', resumeRoom.songCount)}
                  </span>
                  <button
                    className={styles.resumeBtn}
                    onClick={() => router.push(`/host/${resumeRoom.code}`)}
                  >
                    {t('home.resume.button')}
                  </button>
                  <button
                    className={styles.resumeDismiss}
                    onClick={dismissResume}
                    aria-label={t('home.resume.dismiss')}
                    title={t('home.resume.dismiss')}
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>

            <HeroDemo />

            <HeroCtaCard
              hostName={hostName}
              customCode={customCode}
              joinCode={joinCode}
              showCustom={showCustom}
              showJoin={showJoin}
              creating={creating}
              hostError={hostError}
              nameInputRef={nameInputRef}
              onHostNameChange={(v) => {
                setHostName(v);
                setHostError('');
              }}
              onCustomCodeChange={(v) => {
                setCustomCode(v);
                setHostError('');
              }}
              onJoinCodeChange={setJoinCode}
              onToggleCustom={() => {
                setShowCustom((v) => !v);
                setHostError('');
              }}
              onShowJoin={() => setShowJoin(true)}
              onHost={handleHost}
              onJoin={handleJoin}
            />
          </div>
        </section>

        <GlobalReach stats={stats} />
        <HowItWorksSection />
        <SetupSection />
        <FeaturesSection />
        <UseCasesSection />
        <FaqSection />

        <section className={styles.ctaSection}>
          <Reveal>
            <h2 className={styles.ctaTitle}>{t('home.cta.title')}</h2>
            <p className={styles.ctaSub}>
              {t('home.cta.sub')}
            </p>
            <div className={styles.ctaButtons}>
              <button
                className={styles.btnPrimary}
                onClick={handleHostCta}
                disabled={creating}
              >
                {creating ? t('home.creating') : t('home.nav.host')}
              </button>
              <button className={styles.btnOutline} onClick={handleJoinCta}>
                {t('home.nav.join')}
              </button>
            </div>
          </Reveal>
        </section>
      </main>

      <HomeFooter />
    </>
  );
};

export default Home;
