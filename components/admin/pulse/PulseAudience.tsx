import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { AnalyticsData } from '../types';
import { countryFlag, pct, safeDecode } from '../format';
import { localeName } from '../roomDetailLabels';
import BarList from '../charts/BarList';
import DeviceBreakdown from './DeviceBreakdown';
import { SERIES } from '../charts/palette';

export default function PulseAudience({
  data,
}: {
  data: AnalyticsData;
}): React.ReactElement {
  const { geo, languages, devices, tv } = data;

  const mobile = devices.find((d) => d._id === 'Mobile')?.count ?? 0;
  const desktop = devices.find((d) => d._id === 'Desktop')?.count ?? 0;
  const tvCount = devices.find((d) => d._id === 'TV')?.count ?? 0;
  const totalDevices = mobile + desktop + tvCount;

  const tvHosts = tv?.byRole.find((r) => r._id === 'host')?.count ?? 0;
  const tvDisplays = tv?.byRole.find((r) => r._id === 'display')?.count ?? 0;

  const totalChosen =
    languages?.bySession.reduce((sum, l) => sum + l.chosen, 0) ?? 0;
  const totalSessions =
    languages?.bySession.reduce((sum, l) => sum + l.sessions, 0) ?? 0;

  return (
    <>
      <div className={styles.cardPair}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top countries (by rooms)</h2>
          <BarList
            data={geo.countries.map((d) => ({
              label: d._id,
              prefix: countryFlag(d._id),
              value: d.count,
            }))}
            maxRows={12}
          />
        </section>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Top cities (by rooms)</h2>
          <BarList
            color={SERIES[2]}
            data={geo.cities.map((d) => ({
              label: `${safeDecode(d._id.city)}, ${safeDecode(d._id.region || d._id.country)}`,
              prefix: countryFlag(d._id.country),
              value: d.count,
            }))}
            maxRows={12}
          />
        </section>
      </div>

      {languages && languages.bySession.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Languages (by rooms)</h2>
          <p className={styles.cardNote}>
            {languages.bySession.length} languages seen · non-English rooms:{' '}
            {languages.nonEnglishRooms} of {languages.uniqueRooms} (
            {pct(languages.nonEnglishRooms, languages.uniqueRooms)}%) · picked
            deliberately: {pct(totalChosen, totalSessions)}% of sessions
          </p>
          <BarList
            data={languages.bySession.map((l) => ({
              label: `${localeName(l._id)} (${l._id})`,
              value: l.rooms,
              title: `${localeName(l._id)}: ${l.rooms} rooms · ${l.sessions} sessions · ${l.hosts} hosts · ${l.singers} singers · chosen by ${pct(l.chosen, l.sessions)}%`,
            }))}
          />
        </section>
      )}

      {languages && languages.byCountry.length > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Language by country (by rooms)</h2>
          <p className={styles.cardNote}>
            Which language a country actually runs its rooms in — the signal
            behind which packs are worth building next.
          </p>
          <BarList
            color={SERIES[1]}
            data={languages.byCountry.map((d) => ({
              label: `${d._id.country} → ${localeName(d._id.locale)} (${d._id.locale})`,
              prefix: countryFlag(d._id.country),
              value: d.count,
            }))}
            maxRows={15}
          />
        </section>
      )}

      {totalDevices > 0 && !data.deviceDetail && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Devices</h2>
          <p className={styles.cardNote}>
            {pct(mobile, totalDevices)}% mobile · {pct(desktop, totalDevices)}%
            desktop · {pct(tvCount, totalDevices)}% smart TV · {totalDevices}{' '}
            sessions
          </p>
        </section>
      )}

      <DeviceBreakdown data={data} />

      {tv && tv.sessions > 0 && (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Smart TVs</h2>
          <p className={styles.cardNote}>
            {tv.sessions} sessions across {tv.rooms} rooms · {tvHosts} hosting
            the room, {tvDisplays} only showing it. TVs are our slowest clients,
            so a host on one is the load worth watching.
          </p>
          <BarList
            color={SERIES[3]}
            data={tv.byPlatform.map((p) => ({
              label: p._id,
              value: p.count,
            }))}
          />
          {tv.byMonth && tv.byMonth.length > 0 && (
            <>
              <h3 className={styles.sectionHeading}>Rooms started on a TV, by month</h3>
              <BarList
                color={SERIES[6]}
                data={tv.byMonth
                  .filter((m) => m.tvRooms > 0)
                  .map((m) => ({
                    label: m._id,
                    value: m.tvRooms,
                    title: `${m._id}: ${m.tvRooms} of ${m.rooms} rooms (${pct(
                      m.tvRooms,
                      m.rooms
                    )}%) started on a TV`,
                  }))}
                maxRows={12}
              />
            </>
          )}
        </section>
      )}
    </>
  );
}
