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
 * Deliberately static English rather than the t() catalog, for the same reason
 * as /privacy: legal copy has to say exactly one precise thing, so translating
 * it is a legal review, not an i18n pass.
 */
const TermsPage: NextPage = () => {
  const url = `${SITE_URL}/terms`;

  return (
    <>
      <Head>
        <title>Terms of Service — KaraoQ</title>
        <meta
          name="description"
          content="The terms you agree to when you use KaraoQ, including its use of the YouTube API Services."
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
          <h1 className={guideStyles.h1}>Terms of Service</h1>
          <p className={styles.updated}>Last updated: {LAST_UPDATED}</p>

          <section className={styles.section}>
            <p className={styles.p}>
              KaraoQ (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is a free, real-time karaoke queue app.
              A host creates a room, guests join from their phones and search for songs to add to
              a shared queue, and the room plays back on a shared display. These terms are the
              agreement between you and us for using it.
            </p>
            <p className={styles.p}>
              By opening a room, joining one, or searching for a song, you agree to these terms.
              If you don&rsquo;t agree with them, please don&rsquo;t use KaraoQ.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>YouTube API Services</h2>
            <p className={styles.p}>
              KaraoQ uses the YouTube API Services to search for and play karaoke videos. By using
              KaraoQ you are also agreeing to be bound by the{' '}
              <a
                href="https://www.youtube.com/t/terms"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                YouTube Terms of Service
              </a>
              . Google&rsquo;s use of information received from KaraoQ&rsquo;s use of the YouTube
              API Services is governed by the{' '}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Google Privacy Policy
              </a>
              .
            </p>
            <p className={styles.p}>
              Every song plays in YouTube&rsquo;s own embedded player, with its controls, title,
              and channel attribution intact. We do not host, store, download, or re-encode any
              video. We don&rsquo;t own the songs and we don&rsquo;t license them to you — the
              rights belong to the people who uploaded them and to YouTube, and your use of that
              content is subject to YouTube&rsquo;s terms, not ours.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>No accounts, and rooms are public</h2>
            <p className={styles.p}>
              There are no user accounts. You don&rsquo;t sign up, and using KaraoQ never requires
              a password, an email address, or a persistent identity. A room is identified only by
              its room code.
            </p>
            <p className={styles.p}>
              That means <strong>a room is visible to anyone who has its code</strong>. Anyone who
              can see the code — on a screen, in a photo, over someone&rsquo;s shoulder — can join
              the room, see its queue, and add songs. Treat a room as public, and don&rsquo;t put
              anything in a room name, singer name, or song request that you wouldn&rsquo;t want
              a stranger to read.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Acceptable use</h2>
            <p className={styles.p}>When using KaraoQ, don&rsquo;t:</p>
            <ul className={styles.list}>
              <li>
                Enter names, room names, or messages that are unlawful, harassing, hateful, or
                that impersonate someone else.
              </li>
              <li>
                Queue content that is unlawful, or that you know infringes someone&rsquo;s rights.
              </li>
              <li>
                Join, disrupt, or spam rooms you weren&rsquo;t invited to, or interfere with
                anyone else&rsquo;s session.
              </li>
              <li>
                Scrape, automate, or bulk-query KaraoQ or the YouTube data it returns, or attempt
                to work around our rate limits, caching, or daily search limits.
              </li>
              <li>
                Attempt to download, capture, or redistribute video or audio played through
                KaraoQ, or separate it from YouTube&rsquo;s player.
              </li>
              <li>
                Probe, damage, or attempt unauthorised access to KaraoQ or the infrastructure
                behind it.
              </li>
            </ul>
            <p className={styles.p}>
              We may remove a room or block access if we believe it&rsquo;s being used this way.
              Because there are no accounts, this generally means deleting the room rather than
              suspending a person.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Using KaraoQ at a venue</h2>
            <p className={styles.p}>
              KaraoQ is free to host and free to join, whether that&rsquo;s a living room or a
              bar. If you run KaraoQ at a commercial venue, it is your responsibility to hold
              whatever public-performance or music-licensing permissions your venue and country
              require. We provide the queue; we do not provide, and cannot provide, a performance
              licence for the music.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Your content</h2>
            <p className={styles.p}>
              You keep whatever rights you have in what you type into a room — a room name, a
              singer name, a song request. By entering it, you allow us to display it to other
              people in that room and to store it for as long as the room lives. Rooms and their
              contents auto-delete 30 days after their last activity; the full picture is in our{' '}
              <Link href="/privacy" className={styles.link}>Privacy Policy</Link>.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>The service is provided as-is</h2>
            <p className={styles.p}>
              KaraoQ is free, and it&rsquo;s provided &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo;, without warranties of any kind, express or implied. We don&rsquo;t
              promise it will be uninterrupted, error-free, or available at any particular moment.
            </p>
            <p className={styles.p}>
              In particular, song search depends on the YouTube Data API and on a daily quota we
              don&rsquo;t control. When that quota is spent, or YouTube is unreachable, search may
              return older cached results or stop working until it resets. Videos can also be
              removed or made unplayable by their owners at any time. None of that is something we
              can guarantee around.
            </p>
            <p className={styles.p}>
              We may change, suspend, or discontinue KaraoQ — in whole or in part — at any time,
              and we may update these terms. If we do, we&rsquo;ll change the &ldquo;last
              updated&rdquo; date at the top of this page.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Limitation of liability</h2>
            <p className={styles.p}>
              To the fullest extent the law allows, we are not liable for any indirect, incidental,
              or consequential damages, or for any lost data, lost profits, or spoiled event,
              arising from your use of KaraoQ. Since KaraoQ is provided free of charge, our total
              liability to you is limited to the amount you have paid us for it, which is nothing.
            </p>
            <p className={styles.p}>
              Some jurisdictions don&rsquo;t allow certain warranty disclaimers or liability
              limits, so parts of the two sections above may not apply to you.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Children</h2>
            <p className={styles.p}>
              KaraoQ is not directed at children under 13. If you are under 13, please don&rsquo;t
              use it. Nothing we collect asks for a real identity — see our{' '}
              <Link href="/privacy" className={styles.link}>Privacy Policy</Link>.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Contact</h2>
            <p className={styles.p}>
              Questions about these terms, or want a room deleted? Email{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className={styles.link}>{CONTACT_EMAIL}</a>.
            </p>
          </section>
        </article>
      </div>
    </>
  );
};

export default TermsPage;
