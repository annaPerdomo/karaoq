import Link from 'next/link';
import Head from 'next/head';
import * as React from 'react';
import type { NextPage } from 'next';

import guideStyles from '../styles/Guide.module.css';
import styles from '../styles/Legal.module.css';
import { SITE_URL } from '../lib/i18n/config';

const CONTACT_EMAIL = 'variationsonastring@gmail.com';
const LAST_UPDATED = 'August 5, 2026';

/**
 * Deliberately static English rather than the t() catalog: legal copy has to
 * say exactly one precise thing, so translating it is a legal review, not an
 * i18n pass.
 */
const PrivacyPage: NextPage = () => {
  const url = `${SITE_URL}/privacy`;

  return (
    <>
      <Head>
        <title>Privacy Policy — KaraoQ</title>
        <meta
          name="description"
          content="How KaraoQ collects, uses, and deletes data, including its use of the YouTube API Services."
        />
        <link rel="canonical" href={url} />
        <meta name="robots" content="noindex, follow" />
      </Head>

      <div className={guideStyles.page}>
        <header className={guideStyles.topbar}>
          <Link href="/" className={guideStyles.wordmark}>KaraoQ</Link>
        </header>

        <article className={guideStyles.article}>
          <Link href="/" className={guideStyles.back}>
            <span aria-hidden="true">←</span> Back home
          </Link>

          <p className={guideStyles.eyebrow}>Legal</p>
          <h1 className={guideStyles.h1}>Privacy Policy</h1>
          <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

          <section className={styles.section}>
            <p className={styles.p}>
              KaraoQ (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a real-time karaoke queue app. A host
              creates a room, guests join from their phones and search for songs to add to a
              shared queue, and the room plays back on a shared display. This policy explains
              what data we collect to make that work, how we use it, and how it&rsquo;s deleted.
            </p>
            <p className={styles.p}>
              There are no user accounts. You don&rsquo;t sign up, and using KaraoQ never
              requires a password, an email address, or a persistent identity — a room is
              identified only by its room code. The one place we&rsquo;ll ever have an email
              address is if you choose to leave one on the feedback form.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Data we collect</h2>
            <ul className={styles.list}>
              <li>
                <strong>Room content</strong> — the room name, the songs added to its queue
                (title, artist, YouTube video ID), and any singer name or emoji reaction you
                type into a room. This is visible to anyone with the room code, by design.
              </li>
              <li>
                <strong>Search queries</strong> — when you search for a song, your search text
                is sent to the YouTube Data API to return matching videos, and is stored as the
                key of our own results cache. See &ldquo;YouTube API Services&rdquo; below.
              </li>
              <li>
                <strong>Coarse location</strong> — country, region, and city, inferred from your
                network connection at request time via our hosting provider (Vercel). We do not
                store your IP address.
              </li>
              <li>
                <strong>Usage analytics</strong> — events like creating a room, adding a song, or
                changing a display setting, along with browser/device type, so we can see which
                features get used and where people get stuck. These events are tied to a room,
                not to a person.
              </li>
              <li>
                <strong>Feedback you send us</strong> — if you use the feedback form, we store
                the message you write, an email address if you choose to leave one, and the
                context it was sent from (which page, the room code, browser/device type,
                language, and country) so a bug report can be reproduced.
              </li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>YouTube API Services</h2>
            <p className={styles.p}>
              KaraoQ uses the YouTube API Services to search for and embed karaoke videos. By
              using KaraoQ&rsquo;s search feature, you are also agreeing to be bound by the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                YouTube Terms of Service
              </a>
              . Google&rsquo;s use of information received from KaraoQ&rsquo;s use of the
              YouTube API Services is governed by the{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Google Privacy Policy
              </a>
              . Search results (video title, thumbnail, duration, and view count) are cached to
              reduce redundant lookups. A cached result is served directly for its first 24
              hours; after that we look the search up again and keep the aging copy only as a
              fallback for when YouTube is unreachable or our daily API quota is spent. The
              cache is keyed by your search text, so both the results and that text are deleted
              14 days after the search.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>How long we keep data</h2>
            <ul className={styles.list}>
              <li>
                Rooms (and their queues, singer names, reactions) auto-delete 30 days after
                their last activity — not 30 days after they were created, so a room you keep
                using keeps its contents.
              </li>
              <li>Cached search results (and the search text keying them) auto-delete after 14 days.</li>
              <li>Cached song suggestions auto-delete after 7 days.</li>
              <li>
                Session heartbeats — the repeated pings that keep a room&rsquo;s live
                &ldquo;who&rsquo;s here&rdquo; count accurate — auto-delete after 90 days.
              </li>
              <li>
                Other usage analytics events (a room created, a song added, a display setting
                changed) are kept indefinitely, because they&rsquo;re what we read to see how
                the product is used over time.
              </li>
              <li>
                Feedback you send us is kept until we delete it by hand — a bug report is worth
                keeping until it&rsquo;s fixed. Email us and we&rsquo;ll remove yours.
              </li>
            </ul>
            <p className={styles.p}>
              Every window above is enforced automatically by our database (not a manual
              process), so once something expires it isn&rsquo;t recoverable by us. The two
              entries with no window — long-term usage events and feedback — are the exceptions,
              and we&rsquo;ll delete either on request.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Who we share data with</h2>
            <ul className={styles.list}>
              <li>
                <strong>Google / YouTube</strong> — receives your search text to return video
                results, as described above.
              </li>
              <li>
                <strong>Vercel</strong> — our hosting provider, which processes requests and
                provides the coarse location data described above.
              </li>
              <li>
                <strong>MongoDB Atlas</strong> — our database provider, which stores room and
                analytics data described above.
              </li>
            </ul>
            <p className={styles.p}>We do not sell data, and we do not use it for advertising.</p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Deleting your data</h2>
            <p className={styles.p}>
              Since rooms aren&rsquo;t tied to an account, the fastest way to remove a room&rsquo;s
              content is to stop using it and let it expire (30 days after its last activity), or
              to contact us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>{CONTACT_EMAIL}</a>{' '}
              with the room code and we&rsquo;ll delete it sooner. The same address works for
              feedback you&rsquo;ve sent us and for usage events tied to a room code.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Children&rsquo;s privacy</h2>
            <p className={styles.p}>
              KaraoQ is not directed at children under 13, and we do not knowingly collect data
              from them beyond what&rsquo;s described above. Nothing we collect asks for a real
              identity, and the only contact detail we ever hold is one voluntarily typed into
              the feedback form.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Changes to this policy</h2>
            <p className={styles.p}>
              If this policy changes, we&rsquo;ll update the &ldquo;last updated&rdquo; date at
              the top of this page.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Contact</h2>
            <p className={styles.p}>
              Questions about this policy? Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </article>
      </div>
    </>
  );
};

export default PrivacyPage;
