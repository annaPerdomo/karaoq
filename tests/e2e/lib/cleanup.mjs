import { MongoClient } from 'mongodb';

export async function cleanupRooms(codes, { uri, dbName }) {
  if (!codes.length) return { roomsDeleted: 0, eventsDeleted: 0, sessionsDeleted: 0 };

  const client = new MongoClient(uri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const roomsRes = await db.collection('rooms').deleteMany({ id: { $in: codes } });
    const eventsRes = await db.collection('analytics_events').deleteMany({ roomId: { $in: codes } });
    const sessionsRes = await db.collection('analytics_sessions').deleteMany({ roomId: { $in: codes } });
    return {
      roomsDeleted: roomsRes.deletedCount,
      eventsDeleted: eventsRes.deletedCount,
      sessionsDeleted: sessionsRes.deletedCount,
    };
  } finally {
    await client.close();
  }
}
