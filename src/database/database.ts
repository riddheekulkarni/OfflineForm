
import * as SQLite from 'expo-sqlite';

const dbPromise = SQLite.openDatabaseAsync(
  'eventRegistrationNew.db'
);

export async function createTable() {
  const db = await dbPromise;

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (sync_status IN ('pending', 'synced')),
      created_at TEXT NOT NULL,
      sync_id TEXT NOT NULL UNIQUE
    );
  `);
}

export async function addRegistration(
  name: string,
  phone: string,
  city: string
) {
  const db = await dbPromise;

  const cleanName = name.trim();
  const cleanPhone = phone.trim();
  const cleanCity = city.trim();

  if (!cleanName || !cleanPhone || !cleanCity) {
    throw new Error('All fields are required.');
  }

  if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
    throw new Error(
      'Enter a valid 10-digit Indian mobile number.'
    );
  }

  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM registrations
     WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))
     AND phone = ?
     LIMIT 1;`,
    [cleanName, cleanPhone]
  );

  if (existing) {
    throw new Error('This registration already exists.');
  }

  const syncId =
    Date.now().toString() +
    '-' +
    Math.random().toString(36).slice(2);

  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO registrations
     (name, phone, city, sync_status, created_at, sync_id)
     VALUES (?, ?, ?, 'pending', ?, ?);`,
    [
      cleanName,
      cleanPhone,
      cleanCity,
      createdAt,
      syncId,
    ]
  );
}

export async function getRegistrationCounts() {
  const db = await dbPromise;

  const result = await db.getFirstAsync<{
    pending: number;
    synced: number;
  }>(`
    SELECT
      SUM(
        CASE WHEN sync_status = 'pending'
        THEN 1 ELSE 0 END
      ) AS pending,
      SUM(
        CASE WHEN sync_status = 'synced'
        THEN 1 ELSE 0 END
      ) AS synced
    FROM registrations;
  `);

  return {
    pending: result?.pending ?? 0,
    synced: result?.synced ?? 0,
  };
}

export async function getPendingRegistrations() {
  const db = await dbPromise;

  const records = await db.getAllAsync<{
    id: number;
    name: string;
    phone: string;
    city: string;
    created_at: string;
    sync_id: string;
  }>(
    `SELECT id, name, phone, city, created_at, sync_id
     FROM registrations
     WHERE sync_status = 'pending'
     ORDER BY id ASC;`
  );

  return records;
}

export async function markRegistrationsAsSynced(
  syncIds: string[]
) {
  if (syncIds.length === 0) {
    return;
  }

  const db = await dbPromise;

  for (const syncId of syncIds) {
    await db.runAsync(
      `UPDATE registrations
       SET sync_status = 'synced'
       WHERE sync_id = ?;`,
      [syncId]
    );
  }
}