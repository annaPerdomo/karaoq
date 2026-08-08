import Link from 'next/link';
import Head from 'next/head';
import * as React from 'react';
import type { NextPage } from 'next';

import guideStyles from '../styles/Guide.module.css';
import styles from '../styles/Legal.module.css';
import { SITE_URL } from '../lib/i18n/config';

const CONTACT_EMAIL = 'variationsonastring@gmail.com';
const LAST_UPDATED = 'August 7, 2026';

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
            <h2 className={styles.h2}>How we use and process your information</h2>
            <p className={styles.p}>
              We use the data above only for the purposes listed here, and for nothing else:
            </p>
            <ul className={styles.list}>
              <li>
                <strong>To run the room you&rsquo;re in</strong> — your queue additions, singer
                name, song requests, and reactions are stored so every other device in the room
                (phones, the host&rsquo;s screen, the TV display) can show the same live queue.
                Processing here is automatic: our servers write your action to our database and
                every device in that room polls it back.
              </li>
              <li>
                <strong>To search for songs</strong> — your search text is sent to the YouTube
                Data API, and the results it returns are cached under that text so the same
                search doesn&rsquo;t have to be repeated. See &ldquo;YouTube API
                Services&rdquo; below.
              </li>
              <li>
                <strong>To remember your choices on your own device</strong> — your display name,
                language, and per-room view preferences are stored in your browser so you
                don&rsquo;t re-enter them. See &ldquo;Cookies and storage on your device&rdquo;
                below.
              </li>
              <li>
                <strong>To understand how KaraoQ is used</strong> — usage events and coarse
                location are aggregated into counts (rooms created, songs added, which countries
                and languages, where people drop off) on a private admin dashboard. We read them
                as totals, not as individual histories, and they are tied to a room code rather
                than to a person.
              </li>
              <li>
                <strong>To fix bugs and answer you</strong> — feedback you send, plus the page and
                device context attached to it, is read by us to reproduce the problem and, if you
                left an address, to reply.
              </li>
              <li>
                <strong>To keep the service up</strong> — request metadata is used for rate
                limiting and abuse prevention, and to alert us when the service is degraded (for
                example, when the daily YouTube search quota runs out). Those alerts contain
                service status only, never your data.
              </li>
            </ul>
            <p className={styles.p}>
              We do not sell your information, do not use it for advertising, do not build
              advertising or marketing profiles, and do not use it to make automated decisions
              about you. We do not combine it with data from other sources, and we never use
              YouTube API data for anything beyond the search-and-play flow described here.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>Cookies and storage on your device</h2>
            <p className={styles.p}>
              KaraoQ stores and reads a small amount of information directly on your device, using
              cookies and your browser&rsquo;s local and session storage. We use no advertising,
              analytics, or cross-site tracking cookies, and we do not allow any third party to
              place one through KaraoQ.
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Cookie</strong> — the display name you type is written to a first-party
                cookie (expiring after one year) as well as to local storage, because private
                browsing and in-app browsers routinely drop local storage between visits. It
                holds only the name you chose.
              </li>
              <li>
                <strong>Local storage</strong> — your display name, chosen language, country (used
                to pick song suggestions), a randomly generated device id that lets repeat visits
                count as one session instead of many, the code of the room you last hosted, and
                per-room view preferences such as play mode, QR visibility, and whether tips have
                been seen. This stays on your device until you clear your browser data.
              </li>
              <li>
                <strong>Session storage</strong> — a token identifying the browser tab that
                started playback, so a host with two tabs open doesn&rsquo;t interrupt their own
                song. It is discarded when the tab closes.
              </li>
              <li>
                <strong>Third-party (YouTube)</strong> — videos play through YouTube&rsquo;s
                embedded player, which is loaded from YouTube&rsquo;s own domain. When a video
                plays, YouTube may itself set, read, or recognise cookies and similar storage on
                your device, and may collect information about your playback. That storage is
                placed by YouTube, not by us, is not readable by KaraoQ, and is governed by the{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  Google Privacy Policy
                </a>
                .
              </li>
            </ul>
            <p className={styles.p}>
              You can clear or block all of the above in your browser&rsquo;s settings. Blocking
              storage doesn&rsquo;t lock you out — KaraoQ works without it; you&rsquo;ll just be
              asked for your name again on each visit.
            </p>
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
              . KaraoQ uses a server-side API key only: we never ask you to sign in to YouTube or
              Google, never request access to your YouTube account, and therefore hold no
              authorized YouTube user data. You can review and revoke third-party access to your
              Google account at any time at{' '}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.link}
              >
                Google&rsquo;s security settings
              </a>
              .
            </p>
            <p className={styles.p}>
              Search results (video title, thumbnail, duration, and view count) are cached to
              reduce redundant lookups. A cached result is served directly for its first 24
              hours; after that we look the search up again and keep the aging copy only as a
              fallback for when YouTube is unreachable or our daily API quota is spent. The
              cache is keyed by your search text, so both the results and that text are deleted
              14 days after the search.
            </p>
            <p className={styles.p}>
              No data obtained from the YouTube API — video ids, titles, thumbnails, durations,
              or view counts — is stored for longer than 30 days anywhere in KaraoQ, whether it
              was cached from a search, queued into a room, or recorded in a usage event. Our
              database enforces this itself, on an expiry clock attached to the data rather than a
              cleanup job that could fail to run: cached results expire, rooms expire, and song
              titles and video ids are stored apart from our usage records specifically so they can
              expire on their own — the anonymous &ldquo;a song was added&rdquo; count is kept, what
              the song was is not. In a room still in use past 30 days, entries and song requests
              older than that are removed from it as it&rsquo;s used. Videos always play through
              YouTube&rsquo;s own embedded player, and we never download, copy, or store the videos
              themselves.
            </p>
          </section>

          <section className={styles.section}>
            <h2 className={styles.h2}>How long we keep data</h2>
            <ul className={styles.list}>
              <li>
                Rooms (and their queues, singer names, reactions) auto-delete 30 days after
                their last activity — not 30 days after they were created, so a room you keep
                using keeps its contents. In a room that stays in use past 30 days, individual
                queue entries and song requests older than 30 days are removed from it as the
                room is used.
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
                the product is used over time. The song title and video id are not kept with them:
                those live separately and auto-delete after 30 days, leaving the count without the
                song.
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
            <p className={styles.p}>
              <strong>Inside KaraoQ.</strong> KaraoQ is built and run by one person, who is the
              only one with access to the database and to the private admin dashboard where usage
              totals and feedback are read. That dashboard sits behind a secret, is never public,
              and is used to see how the product is performing and to reproduce reported bugs.
              There is no other internal team, affiliate, or group we pass your information to.
            </p>
            <p className={styles.p}>
              <strong>Inside your room.</strong> Anything you put into a room — your singer name,
              the songs you queue or request, your reactions — is shown to everyone else in that
              room and on its display, by design. Anyone holding the room code can see it.
            </p>
            <p className={styles.p}>
              <strong>Outside parties.</strong> We use these service providers, each processing
              data only to provide their service to us, and none of them receives your
              information to use for their own marketing:
            </p>
            <ul className={styles.list}>
              <li>
                <strong>Google / YouTube</strong> — receives your search text (and, when a video
                plays, the request your browser makes to YouTube&rsquo;s embedded player) in
                order to return and play video results, as described above.
              </li>
              <li>
                <strong>Vercel</strong> — our hosting provider, which processes every request to
                KaraoQ and provides the coarse location data described above.
              </li>
              <li>
                <strong>MongoDB Atlas</strong> — our database provider, which stores the room,
                analytics, and feedback data described above.
              </li>
              <li>
                <strong>ntfy.sh</strong> — the push service that alerts us when KaraoQ is
                degraded. It receives service status only (for example &ldquo;the daily search
                quota is spent&rdquo;) and never receives your information.
              </li>
            </ul>
            <p className={styles.p}>
              We do not sell data, we do not share it for advertising or marketing by anyone, and
              we do not transfer it to any other party — with one exception: if we were ever
              legally required to disclose something (a valid legal request), or needed to
              disclose it to investigate abuse of the service, we would.
            </p>
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
