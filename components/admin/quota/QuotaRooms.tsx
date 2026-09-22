import * as React from 'react';
import styles from '../../../styles/Admin.module.css';
import type { DayRoomsWire, RoomSpendWire } from '../types';
import { countryFlag, formatTimestamp, safeDecode } from '../format';
import { formatDay } from './day';

function whereText(room: RoomSpendWire): string {
  if (room.city) return `${safeDecode(room.city)}, ${room.country ?? ''}`.replace(/, $/, '');
  return room.country ?? '';
}

export default function QuotaRooms({
  day,
  today,
  onOpenRoom,
}: {
  day: DayRoomsWire;
  today: string;
  onOpenRoom: (roomId: string) => void;
}): React.ReactElement {
  const isToday = day.day === today;
  const hiddenSearches = day.searches - day.rooms.reduce((sum, r) => sum + r.searches, 0);
  const hiddenRooms = day.roomCount - day.rooms.length;

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>
        Rooms that searched {isToday ? 'today' : `on ${formatDay(day.day, true)}`}
      </h2>
      {day.rooms.length === 0 ? (
        <p className={styles.empty}>
          No room ran a live search {isToday ? 'yet today' : 'that day'}.
        </p>
      ) : (
        <div className={styles.quotaScroll}>
          <table className={styles.quotaTable}>
            <thead>
              <tr>
                <th scope="col">Room</th>
                <th scope="col">Where</th>
                <th scope="col">Searches</th>
                <th scope="col">Share</th>
                <th scope="col">Last search</th>
              </tr>
            </thead>
            <tbody>
              {day.rooms.map((room) => (
                <tr key={room.roomId}>
                  <td>
                    <button
                      className={styles.roomJumpChip}
                      onClick={() => onOpenRoom(room.roomId)}
                      title={`Open ${room.roomId} in the Rooms view`}
                    >
                      {room.roomId}
                    </button>
                  </td>
                  <td className={styles.quotaWhere}>
                    <span className={styles.wantedFlags} aria-hidden="true">
                      {countryFlag(room.country) || '🌐'}
                    </span>
                    {whereText(room) || 'Somewhere'}
                  </td>
                  <td>{room.searches}</td>
                  <td>{Math.round((room.searches / day.searches) * 100)}%</td>
                  <td>{formatTimestamp(room.lastAt)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  {hiddenSearches > 0
                    ? `All rooms (${hiddenSearches} more searches${
                        hiddenRooms > 0 ? ` by ${hiddenRooms} smaller rooms` : ' with no room id'
                      })`
                    : 'All rooms'}
                </td>
                <td />
                <td>{day.searches}</td>
                <td>100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
