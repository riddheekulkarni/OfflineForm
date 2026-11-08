import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';

import {
  initializeDatabase,
  addRegistration,
  getAllRegistrations,
  getPendingRegistrations,
  getRegistrationCounts,
  markRegistrationsSynced,
} from '../database/database';

describe('Database tests', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('eventRegistrationIOS');

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(
        new Error('Database deletion was blocked.')
      );
    });

    await initializeDatabase();
  });

  it('should save registrations, prevent duplicates and update sync status', async () => {
    // Initially, the database should be empty.
    let records = await getAllRegistrations();
    expect(records.length).toBe(0);

    // Add the first registration.
    const firstId = await addRegistration(
      'Riddhee Kulkarni',
      '9876543210',
      'Pune',
      'T1'
    );

    expect(firstId).toBeGreaterThan(0);

    // Check that the registration is saved as pending.
    records = await getAllRegistrations();

    expect(records.length).toBe(1);
    expect(records[0].name).toBe('Riddhee Kulkarni');
    expect(records[0].phone).toBe('9876543210');
    expect(records[0].city).toBe('Pune');
    expect(records[0].sync_status).toBe('pending');
    expect(records[0].tablet_label).toBe('T1');

    // Same name and phone should be rejected.
    await expect(
      addRegistration(
        'riddhee kulkarni',
        '9876543210',
        'Pune',
        'T1'
      )
    ).rejects.toThrow('already registered');

    // A different name with the same phone should be allowed.
    const secondId = await addRegistration(
      'Aarav Patil',
      '9876543210',
      'Mumbai',
      'T2'
    );

    expect(secondId).toBeGreaterThan(0);

    // Both registrations should be pending.
    let counts = await getRegistrationCounts();

    expect(counts).toEqual({
      pending: 2,
      synced: 0,
    });

    let pendingRecords = await getPendingRegistrations();
    expect(pendingRecords.length).toBe(2);

    // Mark only the first registration as synced.
    await markRegistrationsSynced([firstId]);

    counts = await getRegistrationCounts();

    expect(counts).toEqual({
      pending: 1,
      synced: 1,
    });

    pendingRecords = await getPendingRegistrations();

    expect(pendingRecords.length).toBe(1);
    expect(pendingRecords[0].id).toBe(secondId);

    // Mark the second registration as synced.
    await markRegistrationsSynced([secondId]);

    counts = await getRegistrationCounts();

    expect(counts).toEqual({
      pending: 0,
      synced: 2,
    });

    // Calling with an empty ID list should not cause an error.
    await expect(markRegistrationsSynced([])).resolves.toBeUndefined();
  });
});