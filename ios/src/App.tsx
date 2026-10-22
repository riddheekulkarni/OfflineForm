import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import './App.css';

import {
  addRegistration,
  getRegistrationCounts,
  getPendingRegistrations,
  initializeDatabase,
  markRegistrationsSynced,
  type Registration,
} from './database/database';

import {
  createCSVFiles,
  createEmailBatches,
  type EmailBatch,
} from './services/csvService';

import { shareCSVFiles } from './services/shareService';

interface PreparedEmailBatch extends EmailBatch {
  registrationIds: number[];
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

function App() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [countError, setCountError] = useState('');

  const [message, setMessage] = useState('Loading registrations...');
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sharingBatchNumber, setSharingBatchNumber] =
    useState<number | null>(null);

  const [emailBatches, setEmailBatches] =
    useState<PreparedEmailBatch[]>([]);

  // Older/slower refresh requests must not overwrite a newer result.
  const countRequestId = useRef(0);
  const mounted = useRef(false);

  const refreshCountsFromDB = useCallback(async (): Promise<boolean> => {
    const requestId = ++countRequestId.current;
    const maximumAttempts = 3;

    for (let attempt = 1; attempt <= maximumAttempts; attempt++) {
      try {
        const counts = await getRegistrationCounts();

        // Ignore results from an older refresh request.
        if (requestId !== countRequestId.current) {
          return false;
        }

        if (!mounted.current) {
          return false;
        }

        setPendingCount(counts.pending);
        setSyncedCount(counts.synced);
        setCountsLoaded(true);
        setCountError('');
        return true;
      } catch {
        if (requestId !== countRequestId.current) {
          return false;
        }

        if (attempt < maximumAttempts) {
          // Retry temporary iOS IndexedDB read failures.
          await wait(250 * attempt);
        }
      }
    }

    if (mounted.current && requestId === countRequestId.current) {
      // Keep the last successful counts; never replace them with 0 / 0.
      setCountError(
        'Could not refresh the counts. Your saved registrations have not been deleted. The app will try again when it becomes active.'
      );
    }

    return false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;

    async function startApp() {
      try {
        await initializeDatabase();

        if (!active) return;

        setIsReady(true);
        const loaded = await refreshCountsFromDB();

        if (!active) return;

        if (loaded) {
          setMessage('');
        } else {
          setMessage('The database opened, but the counts could not be refreshed yet.');
        }
      } catch {
        if (!active) return;

        setMessage(
          'Could not open the local database. Your data has not been intentionally cleared. Please close and reopen the app.'
        );
      }
    }

    function refreshWhenActive() {
      if (document.visibilityState === 'visible') {
        void refreshCountsFromDB();
      }
    }

    function refreshOnPageShow() {
      // pageshow also fires when Safari restores a page from its back-forward cache.
      void refreshCountsFromDB();
    }

    function refreshOnFocus() {
      void refreshCountsFromDB();
    }

    void startApp();

    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('pageshow', refreshOnPageShow);
    window.addEventListener('focus', refreshOnFocus);

    return () => {
      active = false;
      mounted.current = false;
      countRequestId.current += 1;
      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('pageshow', refreshOnPageShow);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [refreshCountsFromDB]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !isReady) return;

    const cleanName = name.trim().replace(/\s+/g, ' ');
    const cleanPhone = phone.trim();
    const cleanCity = city.trim().replace(/\s+/g, ' ');

    if (!cleanName || !cleanPhone || !cleanCity) {
      setMessage('Please fill in all three fields.');
      return;
    }

    if (!/^[A-Za-z ]+$/.test(cleanName)) {
      setMessage('Name must contain English letters and spaces only.');
      return;
    }

    if (!/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      setMessage('Enter a valid 10-digit Indian mobile number.');
      return;
    }

    if (!/^[A-Za-z ]+$/.test(cleanCity)) {
      setMessage('City must contain English letters and spaces only.');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      await addRegistration(cleanName, cleanPhone, cleanCity);

      setName('');
      setPhone('');
      setCity('');
      setEmailBatches([]);

      // Give immediate feedback, then confirm the exact totals from IndexedDB.
      if (countsLoaded) {
        setPendingCount((current) => current + 1);
      }

      setMessage('Registration saved successfully on this device.');

      const refreshed = await refreshCountsFromDB();
      if (!refreshed) {
        setMessage(
          'Registration saved successfully. The count refresh is taking longer than expected; the app will retry when it becomes active.'
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not save the registration.'
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSync() {
    if (isSaving || isSyncing || sharingBatchNumber !== null) return;

    setIsSyncing(true);
    setMessage('');
    setEmailBatches([]);

    try {
      const pending: Registration[] = await getPendingRegistrations();

      if (pending.length === 0) {
        setMessage('There are no pending registrations to sync.');
        return;
      }

      if (pending.some((registration) => registration.id === undefined)) {
        throw new Error(
          'Some registrations are missing IDs. Reload the app and try again.'
        );
      }

      const csvFiles = createCSVFiles(pending);
      const batches = createEmailBatches(csvFiles);

      let registrationOffset = 0;

      const preparedBatches: PreparedEmailBatch[] = batches.map((batch) => {
        const batchRegistrations = pending.slice(
          registrationOffset,
          registrationOffset + batch.recordCount
        );

        registrationOffset += batch.recordCount;

        return {
          ...batch,
          registrationIds: batchRegistrations.map(
            (registration) => registration.id as number
          ),
        };
      });

      setEmailBatches(preparedBatches);
      setMessage(
        `Prepared ${csvFiles.length} CSV file(s) in ${batches.length} email batch(es).`
      );

      // Reconcile the counts without changing the registration statuses.
      void refreshCountsFromDB();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not prepare the CSV batches.'
      );
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleShareBatch(batch: PreparedEmailBatch) {
    if (isSaving || sharingBatchNumber !== null) return;

    setSharingBatchNumber(batch.batchNumber);
    setMessage('');

    try {
      await shareCSVFiles(batch.files);

      const sent = window.confirm(
        `Batch ${batch.batchNumber} contains ${batch.recordCount} registrations.\n\nDid you actually send the email from your email app?\n\nChoose OK only if you sent it. Choose Cancel to leave the records pending.`
      );

      if (!sent) {
        setMessage(
          `Batch ${batch.batchNumber} remains pending because sending was not confirmed.`
        );
        return;
      }

      await markRegistrationsSynced(batch.registrationIds);

      // Keep the UI responsive, then load the authoritative totals.
      setPendingCount((current) =>
        Math.max(0, current - batch.recordCount)
      );
      setSyncedCount((current) => current + batch.recordCount);

      setEmailBatches((current) =>
        current.filter((item) => item.batchNumber !== batch.batchNumber)
      );

      setMessage(
        `Batch ${batch.batchNumber} was confirmed. ${batch.recordCount} registrations marked as synced.`
      );

      const refreshed = await refreshCountsFromDB();
      if (!refreshed) {
        setMessage(
          `Batch ${batch.batchNumber} was marked as synced. The count refresh will retry when the app becomes active.`
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage(
          'Sharing was cancelled. No registrations were marked as synced.'
        );
      } else {
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not share this batch. Its registrations remain pending unless the status update already completed.'
        );
      }

      // A failed share or update may have left counts unchanged; reconcile.
      void refreshCountsFromDB();
    } finally {
      setSharingBatchNumber(null);
    }
  }

  const isBusy = isSaving || isSyncing || sharingBatchNumber !== null;

  return (
    <main className="app-container">
      <header className="app-header">
        <p className="app-eyebrow">WELCOME</p>
        <h1>Event Registration</h1>
        <p>Register participants and save records on this iPad.</p>
      </header>

      <form onSubmit={handleSubmit} className="registration-form">
        <h2>Participant Details</h2>

        <label htmlFor="name">Name</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Enter full name"
          autoComplete="name"
          required
          disabled={!isReady || isBusy}
        />

        <label htmlFor="phone">Phone Number</label>
        <input
          id="phone"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="10-digit mobile number"
          maxLength={10}
          autoComplete="tel"
          required
          disabled={!isReady || isBusy}
        />

        <label htmlFor="city">City</label>
        <input
          id="city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder="Enter city"
          autoComplete="address-level2"
          required
          disabled={!isReady || isBusy}
        />

        <button type="submit" disabled={!isReady || isBusy}>
          {isSaving ? 'Saving...' : 'Save Registration'}
        </button>
      </form>

      {message && (
        <p className="status-message" role="status" aria-live="polite">
          {message}
        </p>
      )}

      {countError && (
        <p className="status-message" role="status" aria-live="polite">
          {countError}
        </p>
      )}

      <section className="registration-counts" aria-live="polite">
        <h2>Registration Status</h2>
        {!countsLoaded ? (
          <p>Loading saved registration counts...</p>
        ) : (
          <>
            <div className="count-row">
              <span>Pending</span>
              <strong>{pendingCount}</strong>
            </div>
            <div className="count-row">
              <span>Synced</span>
              <strong>{syncedCount}</strong>
            </div>
          </>
        )}
      </section>

      <section className="sync-section">
        <h2>Sync Registrations</h2>
        <p>
          Each CSV contains up to 250 registrations. Share up to five CSV files
          per email. Enter the recipient and subject manually in your email app.
        </p>

        <button
          type="button"
          onClick={handleSync}
          disabled={!isReady || isBusy}
        >
          {isSyncing ? 'Preparing batches...' : 'Prepare CSV for Sync'}
        </button>
      </section>

      {emailBatches.length > 0 && (
        <section className="batch-section">
          <h2>Prepared Email Batches</h2>

          <p className="help-text">
            Select a batch to share its CSV attachments. Enter the recipient and
            subject in your email app. Confirm sending only after you actually
            send the email.
          </p>

          {emailBatches.map((batch) => (
            <article className="batch-item" key={batch.batchNumber}>
              <h3>Batch {batch.batchNumber}</h3>
              <p>CSV files: {batch.files.length}</p>
              <p>Registrations: {batch.recordCount}</p>

              <ul>
                {batch.files.map((file) => (
                  <li key={file.fileName}>
                    {file.fileName} ({file.recordCount} records)
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void handleShareBatch(batch)}
                disabled={!isReady || isBusy}
              >
                {sharingBatchNumber === batch.batchNumber
                  ? 'Opening share sheet...'
                  : `Share Batch ${batch.batchNumber}`}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default App;
