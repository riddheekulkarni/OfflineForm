export type SyncStatus = 'pending' | 'synced';

export interface Registration {
  id?: number;
  name: string;
  phone: string;
  city: string;
  sync_status: SyncStatus;
  created_at: string;
  namePhoneKey: string;
}

const DB_NAME = 'eventRegistrationIOS';
const DB_VERSION = 2;
const STORE_NAME = 'registrations';

let dbPromise: Promise<IDBDatabase> | null = null;

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
          'Database upgrade is blocked. Close other tabs or app windows using this app, then try again.'
        )
      );
    };
  });

  return dbPromise;
}

function createNamePhoneKey(name: string, phone: string): string {
  const normalizedName = name
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

  const normalizedPhone = phone.trim();

  return JSON.stringify([normalizedName, normalizedPhone]);
}

export async function addRegistration(
  name: string,
  phone: string,
  city: string
): Promise<number> {
  const db = await openDatabase();

  const cleanName = name.trim().replace(/\s+/g, ' ');
  const cleanPhone = phone.trim();
  const cleanCity = city.trim().replace(/\s+/g, ' ');

  if (!cleanName || !cleanPhone || !cleanCity) {
    throw new Error('Please fill in all three fields.');
  }

  if (!/^[A-Za-z ]+$/.test(cleanName)) {
    throw new Error('Name must contain letters and spaces only.');
  }

  if (!/^[A-Za-z ]+$/.test(cleanCity)) {
    throw new Error('City must contain letters and spaces only.');
  }

  if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
    throw new Error('Please enter a valid 10-digit Indian mobile number.');
  }

  const registration: Registration = {
    name: cleanName,
    phone: cleanPhone,
    city: cleanCity,
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    namePhoneKey: createNamePhoneKey(cleanName, cleanPhone),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(registration);

    let registrationId: number | undefined;
    let requestError: Error | null = null;

    request.onsuccess = () => {
      registrationId = request.result as number;
    };

    request.onerror = () => {
      if (request.error?.name === 'ConstraintError') {
        requestError = new Error(
          'This participant with the same name and phone number is already registered on this device.'
        );
      } else {
        requestError = new Error(
          request.error?.message ?? 'Could not save registration.'
        );
      }
    };

    transaction.oncomplete = () => {
      if (requestError) {
        reject(requestError);
        return;
      }

      if (registrationId === undefined) {
        reject(new Error('Registration was not saved.'));
        return;
      }

      resolve(registrationId);
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
  });
}

export async function getPendingRegistrations(): Promise<Registration[]> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index('status').getAll('pending');

    request.onsuccess = () => {
      resolve(request.result as Registration[]);
    };

    request.onerror = () => {
      reject(
        request.error ?? new Error('Could not retrieve pending records.')
      );
    };
  });
}

export async function getRegistrationCounts(): Promise<{
  pending: number;
  synced: number;
}> {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // Fast check: retrieve all records directly to avoid iOS WebKit index counting stalls
    const request = store.getAll();

    request.onsuccess = () => {
      const all = request.result as Registration[];
      let pending = 0;
      let synced = 0;

      for (let i = 0; i < all.length; i++) {
        if (all[i].sync_status === 'synced') {
          synced++;
        } else {
          pending++;
        }
      }

      resolve({ pending, synced });
    };

    request.onerror = () => {
      reject(request.error ?? new Error('Could not count registrations.'));
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Counting transaction failed.'));
    };
  });
}

export async function markRegistrationsSynced(ids: number[]): Promise<void> {
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

    transaction.oncomplete = () => {
      resolve();
    };

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