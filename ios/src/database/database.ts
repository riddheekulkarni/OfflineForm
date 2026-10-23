export type SyncStatus = 'pending' | 'synced';

export interface Registration {
  id?: number;
  name: string;
  phone: string;
  city: string;
  sync_status: SyncStatus;
  created_at: string;
  namePhoneKey: string;
  tablet_label?: string;
}

const DB_NAME = 'eventRegistrationIOS';
const DB_VERSION = 2;
const STORE_NAME = 'registrations';

let dbPromise: Promise<IDBDatabase> | null = null;

export function normalizeIndianPhone(value: string): string {
  let phone = value.trim().replace(/[\s()-]/g, '');

  if (phone.startsWith('+91')) {
    phone = phone.slice(3);
  } else if (phone.startsWith('91') && phone.length === 12) {
    phone = phone.slice(2);
  }

  if (phone.startsWith('0') && phone.length === 11) {
    phone = phone.slice(1);
  }

  if (!/^[6-9][0-9]{9}$/.test(phone)) {
    return '';
  }

  return phone;
}

export function validatePersonName(value: string): boolean {
  const clean = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');

  return /^[\p{L}\p{M}]+(?:[ .’‘'-][\p{L}\p{M}]+)*$/u.test(clean);
}

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction;

      if (!transaction) {
        return;
      }

      let store: IDBObjectStore;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        store = db.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
      } else {
        store = transaction.objectStore(STORE_NAME);
      }

      if (!store.indexNames.contains('status')) {
        store.createIndex('status', 'sync_status', {
          unique: false,
        });
      }

      if (!store.indexNames.contains('namePhoneKey')) {
        store.createIndex('namePhoneKey', 'namePhoneKey', {
          unique: true,
        });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };

      db.onclose = () => {
        dbPromise = null;
      };

      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error('Could not open the database.'));
    };

    request.onblocked = () => {
      dbPromise = null;
      reject(
        new Error(
          'Database upgrade is blocked. Close other app tabs and try again.'
        )
      );
    };
  });

  return dbPromise;
}

function createNamePhoneKey(name: string, phone: string): string {
  const normalizedName = name
    .normalize('NFKC')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();

  return JSON.stringify([
    normalizedName,
    normalizeIndianPhone(phone),
  ]);
}

export async function addRegistration(
  name: string,
  phone: string,
  city: string,
  tabletLabel = 'T1'
): Promise<number> {
  const db = await openDatabase();

  const cleanName = name.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  const cleanPhone = normalizeIndianPhone(phone);
  const cleanCity = city.normalize('NFKC').trim().replace(/\s+/gu, ' ');

  if (!cleanName || !phone.trim() || !cleanCity) {
    throw new Error('Please fill in all three fields.');
  }

  if (!validatePersonName(cleanName)) {
    throw new Error('Name contains invalid characters.');
  }

  if (!validatePersonName(cleanCity)) {
    throw new Error('City contains invalid characters.');
  }

  if (!cleanPhone) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }

  const registration: Registration = {
    name: cleanName,
    phone: cleanPhone,
    city: cleanCity,
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    namePhoneKey: createNamePhoneKey(cleanName, cleanPhone),
    tablet_label: /^T[1-7]$/.test(tabletLabel) ? tabletLabel : 'T1',
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const existingRequest = store.getAll();

    let registrationId: number | undefined;
    let requestError: Error | null = null;

    existingRequest.onsuccess = () => {
      const existing = existingRequest.result as Registration[];
      const normalizedName = cleanName.toLowerCase();

      const duplicate = existing.some((item) => {
        const oldPhone = normalizeIndianPhone(item.phone);
        const oldName = item.name
          .normalize('NFKC')
          .trim()
          .replace(/\s+/gu, ' ')
          .toLowerCase();

        return oldPhone === cleanPhone && oldName === normalizedName;
      });

      if (duplicate) {
        requestError = new Error(
          'This participant with the same name and phone number is already registered on this device.'
        );

        transaction.abort();
        return;
      }

      registration.namePhoneKey = createNamePhoneKey(cleanName, cleanPhone);

      const addRequest = store.add(registration);

      addRequest.onsuccess = () => {
        registrationId = addRequest.result as number;
      };

      addRequest.onerror = () => {
        if (addRequest.error?.name === 'ConstraintError') {
          requestError = new Error(
            'This participant with the same name and phone number is already registered on this device.'
          );
        } else {
          requestError = new Error(
            addRequest.error?.message ?? 'Could not save registration.'
          );
        }
      };
    };

    existingRequest.onerror = () => {
      requestError = new Error(
        existingRequest.error?.message ??
          'Could not check existing registrations.'
      );

      transaction.abort();
    };

    transaction.oncomplete = () => {
      if (requestError) {
        reject(requestError);
      } else if (registrationId === undefined) {
        reject(new Error('Registration was not saved.'));
      } else {
        resolve(registrationId);
      }
    };

    transaction.onerror = () => {
      reject(
        requestError ??
          transaction.error ??
          new Error('Could not save registration.')
      );
    };

    transaction.onabort = () => {
      reject(
        requestError ??
          transaction.error ??
          new Error('Registration was cancelled.')
      );
    };
  });
}

export async function getAllRegistrations(): Promise<Registration[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).getAll();

    request.onsuccess = () => {
      resolve(request.result as Registration[]);
    };

    request.onerror = () => {
      reject(
        request.error ?? new Error('Could not retrieve registrations.')
      );
    };

    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error('Could not retrieve registrations.')
      );
    };
  });
}

export async function getPendingRegistrations(): Promise<Registration[]> {
  const all = await getAllRegistrations();

  return all.filter(
    (registration) => registration.sync_status !== 'synced'
  );
}

export async function getRegistrationCounts(): Promise<{
  pending: number;
  synced: number;
}> {
  const all = await getAllRegistrations();

  let pending = 0;
  let synced = 0;

  for (const registration of all) {
    if (registration.sync_status === 'synced') {
      synced++;
    } else {
      pending++;
    }
  }

  return { pending, synced };
}

export async function markRegistrationsSynced(
  ids: number[]
): Promise<void> {
  if (ids.length === 0) {
    return;
  }

  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const id of ids) {
      const request = store.get(id);

      request.onsuccess = () => {
        const registration = request.result as Registration | undefined;

        if (registration) {
          registration.sync_status = 'synced';
          store.put(registration);
        }
      };
    }

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error('Could not update sync status.')
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ?? new Error('Status update was cancelled.')
      );
    };
  });
}

export async function initializeDatabase(): Promise<void> {
  await openDatabase();
}

export async function assignTabletLabelToLegacyRecords(
  tabletLabel: string
): Promise<void> {
  const db = await openDatabase();
  const safeLabel = /^T[1-7]$/.test(tabletLabel) ? tabletLabel : 'T1';

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result as Registration[];

      for (const record of records) {
        if (!record.tablet_label) {
          record.tablet_label = safeLabel;
          store.put(record);
        }
      }
    };

    transaction.oncomplete = () => resolve();

    transaction.onerror = () => {
      reject(
        transaction.error ?? new Error('Could not save tablet labels.')
      );
    };

    transaction.onabort = () => {
      reject(
        transaction.error ?? new Error('Tablet label update was cancelled.')
      );
    };
  });
}