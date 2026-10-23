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
  assignTabletLabelToLegacyRecords,
  getAllRegistrations,
  getRegistrationCounts,
  initializeDatabase,
  markRegistrationsSynced,
  normalizeIndianPhone,
  type Registration,
} from './database/database';

import {
  createCSVFiles,
  createEmailBatches,
  type EmailBatch,
} from './services/csvService';

import { shareCSVFiles } from './services/shareService';

type Language = 'en' | 'hi' | 'mr';
type TabletLabel = 'T1' | 'T2' | 'T3' | 'T4' | 'T5' | 'T6' | 'T7';

interface PreparedBatch extends EmailBatch {
  pendingRegistrationIds: number[];
}

const LANGUAGE_KEY = 'eventRegistration.language';
const TABLET_KEY = 'eventRegistration.tabletLabel';

const TABLETS: TabletLabel[] = [
  'T1',
  'T2',
  'T3',
  'T4',
  'T5',
  'T6',
  'T7',
];

const translations = {
  en: {
    welcome: 'WELCOME',
    title: 'Event Registration',
    language: 'Language',
    tablet: 'Tablet',
    setupTitle: 'Set up this tablet',
    setupText: 'Choose this tablet number to continue.',
    saveSetup: 'Continue',
    details: 'Guest Details',
    name: 'Name',
    namePlaceholder: 'Enter full name',
    phone: 'Phone Number',
    phonePlaceholder: '10-digit mobile number',
    city: 'City',
    cityPlaceholder: 'Enter city',
    save: 'Save Registration',
    saving: 'Saving...',
    status: 'Registration Status',
    loadingCounts: 'Loading counts...',
    pending: 'Pending',
    synced: 'Synced',
    syncTitle: 'Share Registrations',
    syncDescription:
      'Each CSV has up to 250 registrations. Share up to 5 files at a time. Pending records become Synced only after you confirm sharing.',
    prepareSync: 'Prepare to Share',
    preparing: 'Preparing...',
    exportEverything: 'Share All Records',
    exportDescription:
      'Includes both Pending and Synced records. After you confirm sharing, only the Pending records in that batch become Synced.',
    batchesTitle: 'Ready to Share',
    files: 'Files',
    registrations: 'Registrations',
    share: 'Share',
    sharing: 'Opening share...',
    setupRequired: 'Choose a tablet first.',
    fillAll: 'Please fill in all three fields.',
    invalidName: 'Use letters and spaces only for the name.',
    invalidPhone:
      'Enter a valid Indian mobile number. You may include +91, spaces, hyphens or a leading zero.',
    invalidCity: 'Use letters and spaces only for the city.',
    duplicate:
      'This name and phone number are already registered on this device.',
    saved: 'Registration saved.',
    noPending: 'There are no Pending registrations to share.',
    noRecords: 'There are no registrations.',
    preparedSync: (n: number) => `${n} CSV file(s) ready.`,
    preparedExport: (n: number) =>
      `${n} CSV file(s) ready with all records.`,
    confirmShare: (total: number, pending: number) =>
      `This batch contains ${total} registrations, including ${pending} Pending registration(s).\n\nDid you finish sharing or send the email successfully?\n\nChoose OK only after sharing is complete. Choose Cancel to leave Pending records unchanged.`,
    notConfirmed: 'Not confirmed. Registration status was not changed.',
    syncedBatch: (n: number) => `${n} registrations marked Synced.`,
    sharedExport:
      'Files shared. This batch had no Pending records to update.',
    cancelled:
      'Sharing was cancelled. No records were marked Synced.',
    dbError:
      'Could not open the local database. Saved data was not intentionally cleared. Close and reopen the app.',
    countError:
      'Could not refresh the counts. The app will try again when opened.',
    countWait:
      'The database opened, but counts are not ready yet.',
    idError:
      'Some registrations are missing IDs. Reload the app and try again.',
    prepareError: 'Could not prepare the CSV files.',
    shareError:
      'Could not complete the sharing operation. Check the registration counts before trying again.',
    helpBatch:
      'Tap Share, finish sharing the files, then confirm.',
    saveError: 'Could not save. Please try again.',
    sharingUnavailable:
      'This browser cannot share CSV attachments. Open the app in Safari on the iPad using an HTTPS link.',
    syncedCountRefresh:
      'Records were marked Synced, but the counts could not refresh yet.',
  },

  hi: {
    welcome: 'नमस्ते',
    title: 'इवेंट रजिस्ट्रेशन',
    language: 'भाषा',
    tablet: 'टैबलेट',
    setupTitle: 'टैबलेट चुनें',
    setupText: 'शुरू करने के लिए टैबलेट नंबर चुनें।',
    saveSetup: 'आगे बढ़ें',
    details: 'जानकारी भरें',
    name: 'नाम',
    namePlaceholder: 'पूरा नाम लिखें',
    phone: 'मोबाइल नंबर',
    phonePlaceholder: '10 अंकों का नंबर',
    city: 'शहर',
    cityPlaceholder: 'शहर का नाम लिखें',
    save: 'सेव करें',
    saving: 'सेव हो रहा है...',
    status: 'रजिस्ट्रेशन की स्थिति',
    loadingCounts: 'गिनती लोड हो रही है...',
    pending: 'बाकी',
    synced: 'भेजे गए',
    syncTitle: 'रिकॉर्ड शेयर करें',
    syncDescription:
      'एक CSV फ़ाइल में 250 तक रिकॉर्ड होंगे। एक बार में 5 फ़ाइलें शेयर करें। पुष्टि करने के बाद ही बाकी रिकॉर्ड भेजे गए माने जाएंगे।',
    prepareSync: 'शेयर के लिए तैयार करें',
    preparing: 'तैयार हो रहा है...',
    exportEverything: 'सभी रिकॉर्ड शेयर करें',
    exportDescription:
      'इसमें बाकी और पहले भेजे गए सभी रिकॉर्ड होंगे। पुष्टि करने के बाद केवल इस बैच के बाकी रिकॉर्ड भेजे गए माने जाएंगे।',
    batchesTitle: 'तैयार फ़ाइलें',
    files: 'फ़ाइलें',
    registrations: 'रिकॉर्ड',
    share: 'शेयर',
    sharing: 'खुल रहा है...',
    setupRequired: 'पहले टैबलेट चुनें।',
    fillAll: 'तीनों जगह जानकारी भरें।',
    invalidName: 'नाम में सिर्फ अक्षर और खाली जगह इस्तेमाल करें।',
    invalidPhone:
      'सही भारतीय मोबाइल नंबर लिखें। +91, खाली जगह, हाइफ़न या शुरुआत में 0 भी लिख सकते हैं।',
    invalidCity: 'शहर के नाम में सिर्फ अक्षर और खाली जगह इस्तेमाल करें।',
    duplicate: 'यह नाम और नंबर पहले से दर्ज है।',
    saved: 'जानकारी सेव हो गई।',
    noPending: 'शेयर करने के लिए कोई बाकी रिकॉर्ड नहीं है।',
    noRecords: 'कोई रिकॉर्ड नहीं है।',
    preparedSync: (n: number) => `${n} CSV फ़ाइलें तैयार हैं।`,
    preparedExport: (n: number) =>
      `सभी रिकॉर्ड की ${n} CSV फ़ाइलें तैयार हैं।`,
    confirmShare: (total: number, pending: number) =>
      `इस बैच में ${total} रिकॉर्ड हैं, जिनमें ${pending} बाकी रिकॉर्ड हैं।\n\nक्या आपने ईमेल भेज दिया या फ़ाइलें शेयर कर दीं?\n\nशेयर पूरा होने पर ही OK दबाएँ। Cancel दबाने पर बाकी रिकॉर्ड की स्थिति नहीं बदलेगी।`,
    notConfirmed: 'पुष्टि नहीं हुई। रिकॉर्ड की स्थिति नहीं बदली।',
    syncedBatch: (n: number) =>
      `${n} रिकॉर्ड भेजे गए के रूप में सेव हुए।`,
    sharedExport:
      'फ़ाइलें शेयर हुईं। इस बैच में स्थिति बदलने के लिए कोई बाकी रिकॉर्ड नहीं था।',
    cancelled: 'शेयर रद्द हुआ। कोई रिकॉर्ड भेजे गए के रूप में सेव नहीं हुआ।',
    dbError:
      'डेटाबेस नहीं खुला। डेटा जानबूझकर नहीं मिटाया गया। ऐप बंद करके फिर खोलें।',
    countError: 'गिनती अपडेट नहीं हुई। ऐप फिर खोलकर कोशिश करें।',
    countWait: 'गिनती अभी तैयार नहीं है।',
    idError: 'कुछ रिकॉर्ड की ID नहीं मिली। ऐप फिर खोलकर कोशिश करें।',
    prepareError: 'CSV फ़ाइलें तैयार नहीं हुईं।',
    shareError:
      'शेयर पूरा नहीं हुआ। दोबारा कोशिश करने से पहले रिकॉर्ड की गिनती जाँचें।',
    helpBatch: 'Share दबाएँ, फ़ाइलें भेजें और उसके बाद पुष्टि करें।',
    saveError: 'सेव नहीं हुआ। फिर कोशिश करें।',
    sharingUnavailable:
      'यह ब्राउज़र CSV फ़ाइलें शेयर नहीं कर सकता। iPad पर Safari में HTTPS लिंक खोलें।',
    syncedCountRefresh:
      'रिकॉर्ड भेजे गए के रूप में सेव हुए, लेकिन गिनती अपडेट नहीं हुई।',
  },

  mr: {
    welcome: 'नमस्कार',
    title: 'इव्हेंट नोंदणी',
    language: 'भाषा',
    tablet: 'टॅबलेट',
    setupTitle: 'टॅबलेट निवडा',
    setupText: 'सुरू करण्यासाठी टॅबलेटचा नंबर निवडा.',
    saveSetup: 'पुढे जा',
    details: 'माहिती भरा',
    name: 'नाव',
    namePlaceholder: 'पूर्ण नाव लिहा',
    phone: 'मोबाइल नंबर',
    phonePlaceholder: '10 अंकी नंबर',
    city: 'शहर',
    cityPlaceholder: 'शहराचे नाव लिहा',
    save: 'सेव्ह करा',
    saving: 'सेव्ह होत आहे...',
    status: 'नोंदणीची स्थिती',
    loadingCounts: 'मोजणी सुरू आहे...',
    pending: 'बाकी',
    synced: 'पाठवलेले',
    syncTitle: 'नोंदी शेअर करा',
    syncDescription:
      'एका CSV फाइलमध्ये 250 पर्यंत नोंदी असतील. एका वेळी 5 फाइल शेअर करा. खात्री केल्यानंतरच बाकी नोंदी पाठवल्या असे मानले जाईल.',
    prepareSync: 'शेअर करण्यासाठी तयार करा',
    preparing: 'तयार होत आहे...',
    exportEverything: 'सर्व नोंदी शेअर करा',
    exportDescription:
      'यात बाकी आणि आधी पाठवलेल्या सर्व नोंदी असतील. खात्री केल्यानंतर फक्त या बॅचमधील बाकी नोंदी पाठवलेल्या मानल्या जातील.',
    batchesTitle: 'तयार फाइल',
    files: 'फाइल',
    registrations: 'नोंदी',
    share: 'शेअर',
    sharing: 'उघडत आहे...',
    setupRequired: 'आधी टॅबलेट निवडा.',
    fillAll: 'तिन्ही जागा भरा.',
    invalidName: 'नावात फक्त अक्षरे आणि मोकळी जागा वापरा.',
    invalidPhone:
      'योग्य भारतीय मोबाइल नंबर लिहा. +91, मोकळी जागा, हायफन किंवा सुरुवातीला 0 वापरू शकता.',
    invalidCity: 'शहराच्या नावात फक्त अक्षरे आणि मोकळी जागा वापरा.',
    duplicate: 'हे नाव आणि नंबर आधीच नोंदवले आहेत.',
    saved: 'माहिती सेव्ह झाली.',
    noPending: 'शेअर करण्यासाठी बाकी नोंदी नाहीत.',
    noRecords: 'नोंदी नाहीत.',
    preparedSync: (n: number) => `${n} CSV फाइल तयार झाल्या.`,
    preparedExport: (n: number) =>
      `सर्व नोंदींच्या ${n} CSV फाइल तयार झाल्या.`,
    confirmShare: (total: number, pending: number) =>
      `या बॅचमध्ये ${total} नोंदी आहेत. त्यापैकी ${pending} बाकी नोंदी आहेत.\n\nईमेल पाठवला किंवा फाइल शेअर केली का?\n\nशेअर पूर्ण झाल्यावरच OK दाबा. Cancel दाबल्यास बाकी नोंदींची स्थिती बदलणार नाही.`,
    notConfirmed: 'खात्री झाली नाही. नोंदींची स्थिती बदलली नाही.',
    syncedBatch: (n: number) =>
      `${n} नोंदी पाठवलेल्या म्हणून सेव्ह झाल्या.`,
    sharedExport:
      'फाइल शेअर झाली. या बॅचमध्ये स्थिती बदलण्यासाठी बाकी नोंदी नव्हत्या.',
    cancelled: 'शेअर रद्द झाले. कोणतीही नोंद पाठवलेली म्हणून सेव्ह झाली नाही.',
    dbError:
      'डेटाबेस उघडला नाही. डेटा जाणूनबुजून पुसला नाही. अॅप बंद करून पुन्हा उघडा.',
    countError: 'मोजणी अपडेट झाली नाही. अॅप पुन्हा उघडून प्रयत्न करा.',
    countWait: 'मोजणी अजून तयार नाही.',
    idError: 'काही नोंदींची ID मिळाली नाही. अॅप पुन्हा उघडून प्रयत्न करा.',
    prepareError: 'CSV फाइल तयार झाल्या नाहीत.',
    shareError:
      'शेअर पूर्ण झाले नाही. पुन्हा प्रयत्न करण्यापूर्वी नोंदींची मोजणी तपासा.',
    helpBatch: 'Share दाबा, फाइल पाठवा आणि नंतर खात्री करा.',
    saveError: 'सेव्ह झाले नाही. पुन्हा प्रयत्न करा.',
    sharingUnavailable:
      'हा ब्राउझर CSV फाइल शेअर करू शकत नाही. iPad वर Safari मध्ये HTTPS लिंक उघडा.',
    syncedCountRefresh:
      'नोंदी पाठवलेल्या म्हणून सेव्ह झाल्या, पण मोजणी अपडेट झाली नाही.',
  },
} as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getSavedLanguage(): Language {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return value === 'hi' || value === 'mr' ? value : 'en';
  } catch {
    return 'en';
  }
}

function getSavedTablet(): TabletLabel | '' {
  try {
    const value = localStorage.getItem(TABLET_KEY);

    return TABLETS.includes(value as TabletLabel)
      ? (value as TabletLabel)
      : '';
  } catch {
    return '';
  }
}

function normalizePersonText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

function App() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  const [language, setLanguage] = useState<Language>(getSavedLanguage);
  const [tabletLabel, setTabletLabel] = useState<TabletLabel | ''>(
    getSavedTablet,
  );
  const [setupTablet, setSetupTablet] = useState<TabletLabel>('T1');

  const [pendingCount, setPendingCount] = useState(0);
  const [syncedCount, setSyncedCount] = useState(0);
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [countError, setCountError] = useState('');
  const [message, setMessage] = useState('');
  const [isReady, setIsReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isChangingTablet, setIsChangingTablet] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [sharingBatchNumber, setSharingBatchNumber] = useState<number | null>(
    null,
  );
  const [batches, setBatches] = useState<PreparedBatch[]>([]);

  const t = translations[language];
  const requestId = useRef(0);
  const mounted = useRef(false);

  const refreshCounts = useCallback(async (): Promise<boolean> => {
    const thisRequest = ++requestId.current;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const counts = await getRegistrationCounts();

        if (thisRequest !== requestId.current || !mounted.current) {
          return false;
        }

        setPendingCount(counts.pending);
        setSyncedCount(counts.synced);
        setCountsLoaded(true);
        setCountError('');

        return true;
      } catch {
        if (thisRequest !== requestId.current) return false;

        if (attempt < 3) {
          await wait(200 * attempt);
        }
      }
    }

    if (mounted.current && thisRequest === requestId.current) {
      setCountError(t.countError);
    }

    return false;
  }, [t.countError]);

  useEffect(() => {
    document.documentElement.lang = language;

    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // The selected language still works during this session.
    }
  }, [language]);

  useEffect(() => {
    mounted.current = true;
    let active = true;

    async function start() {
      try {
        await initializeDatabase();

        const savedTablet = getSavedTablet();

        if (savedTablet) {
          await assignTabletLabelToLegacyRecords(savedTablet);
        }

        if (!active) return;

        setIsReady(true);

        const loaded = await refreshCounts();

        if (active && !loaded) {
          setMessage(t.countWait);
        }
      } catch {
        if (active) {
          setMessage(t.dbError);
        }
      }
    }

    const refreshWhenActive = () => {
      if (document.visibilityState === 'visible') {
        void refreshCounts();
      }
    };

    void start();

    document.addEventListener('visibilitychange', refreshWhenActive);
    window.addEventListener('pageshow', refreshWhenActive);
    window.addEventListener('focus', refreshWhenActive);

    return () => {
      active = false;
      mounted.current = false;
      requestId.current++;

      document.removeEventListener('visibilitychange', refreshWhenActive);
      window.removeEventListener('pageshow', refreshWhenActive);
      window.removeEventListener('focus', refreshWhenActive);
    };
  }, [refreshCounts, t.countWait, t.dbError]);

  async function saveTablet(label: TabletLabel) {
    if (isChangingTablet) return;

    setIsChangingTablet(true);

    try {
      await assignTabletLabelToLegacyRecords(label);
      localStorage.setItem(TABLET_KEY, label);

      setTabletLabel(label);
      setMessage('');
      setBatches([]);
    } catch {
      setMessage(t.setupRequired);
    } finally {
      setIsChangingTablet(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !isReady || !tabletLabel) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const cleanName = normalizePersonText(name);
    const cleanCity = normalizePersonText(city);
    const cleanPhone = normalizeIndianPhone(phone);

    if (!cleanName || !cleanCity || !phone.trim()) {
      setMessage(t.fillAll);
      return;
    }

    const lettersAndSpaces =
      /^[\p{L}\p{M}]+(?:\s+[\p{L}\p{M}]+)*$/u;

    if (!lettersAndSpaces.test(cleanName)) {
      setMessage(t.invalidName);
      return;
    }

    if (!cleanPhone) {
      setMessage(t.invalidPhone);
      return;
    }

    if (!lettersAndSpaces.test(cleanCity)) {
      setMessage(t.invalidCity);
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      await addRegistration(
        cleanName,
        cleanPhone,
        cleanCity,
        tabletLabel,
      );

      setName('');
      setPhone('');
      setCity('');
      setBatches([]);

      setPendingCount((current) => current + 1);
      setCountsLoaded(true);
      setMessage(t.saved);

      window.setTimeout(() => {
        void refreshCounts();
      }, 100);
    } catch (error) {
      const raw =
        error instanceof Error ? error.message.toLowerCase() : '';

      if (
        raw.includes('already registered') ||
        raw.includes('duplicate')
      ) {
        setMessage(t.duplicate);
      } else if (raw.includes('phone')) {
        setMessage(t.invalidPhone);
      } else if (raw.includes('name')) {
        setMessage(t.invalidName);
      } else if (raw.includes('city')) {
        setMessage(t.invalidCity);
      } else {
        setMessage(t.saveError);
      }

      void refreshCounts();
    } finally {
      setIsSaving(false);
    }
  }

  async function prepareBatches(exportEverything: boolean) {
    if (
      isSaving ||
      isPreparing ||
      sharingBatchNumber !== null ||
      !tabletLabel
    ) {
      return;
    }

    setIsPreparing(true);
    setMessage('');
    setBatches([]);

    try {
      const all: Registration[] = await getAllRegistrations();

      const records = exportEverything
        ? all
        : all.filter((record) => record.sync_status !== 'synced');

      if (records.length === 0) {
        setMessage(exportEverything ? t.noRecords : t.noPending);
        return;
      }

      if (records.some((record) => record.id === undefined)) {
        throw new Error(t.idError);
      }

      const csvFiles = createCSVFiles(records, tabletLabel, all);
      const grouped = createEmailBatches(csvFiles);

      let offset = 0;

      const prepared: PreparedBatch[] = grouped.map((batch) => {
        const batchRecords = records.slice(
          offset,
          offset + batch.recordCount,
        );

        offset += batch.recordCount;

        const pendingRegistrationIds = batchRecords
          .filter((record) => record.sync_status !== 'synced')
          .map((record) => {
            if (record.id === undefined) {
              throw new Error(t.idError);
            }

            return record.id;
          });

        return {
          ...batch,
          pendingRegistrationIds,
        };
      });

      setBatches(prepared);

      setMessage(
        exportEverything
          ? t.preparedExport(csvFiles.length)
          : t.preparedSync(csvFiles.length),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : t.prepareError,
      );
    } finally {
      setIsPreparing(false);
    }
  }

  async function handleShare(batch: PreparedBatch) {
    if (isSaving || sharingBatchNumber !== null) return;

    setSharingBatchNumber(batch.batchNumber);
    setMessage('');

    try {
      await shareCSVFiles(batch.files);

      const pendingInBatch = batch.pendingRegistrationIds.length;

      const question = t.confirmShare(
        batch.recordCount,
        pendingInBatch,
      );

      if (!window.confirm(question)) {
        setMessage(t.notConfirmed);
        return;
      }

      if (pendingInBatch > 0) {
        await markRegistrationsSynced(batch.pendingRegistrationIds);
      }

      const refreshed = await refreshCounts();

      setBatches((current) =>
        current.filter(
          (item) => item.batchNumber !== batch.batchNumber,
        ),
      );

      if (pendingInBatch === 0) {
        setMessage(t.sharedExport);
      } else if (refreshed) {
        setMessage(t.syncedBatch(pendingInBatch));
      } else {
        setMessage(t.syncedCountRefresh);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setMessage(t.cancelled);
      } else {
        const raw =
          error instanceof Error ? error.message.toLowerCase() : '';

        setMessage(
          raw.includes('unavailable') || raw.includes('cannot share')
            ? t.sharingUnavailable
            : t.shareError,
        );
      }

      void refreshCounts();
    } finally {
      setSharingBatchNumber(null);
    }
  }

  const isBusy =
    isSaving ||
    isChangingTablet ||
    isPreparing ||
    sharingBatchNumber !== null;

  return (
    <main className="app-container">
      <header className="app-header">
        <div className="header-controls">
          <label className="compact-control">
            <span>{t.language}</span>
            <select
              aria-label={t.language}
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value as Language);
                setMessage('');
              }}
            >
              <option value="en">English</option>
              <option value="hi">हिंदी</option>
              <option value="mr">मराठी</option>
            </select>
          </label>
        </div>

        <p className="app-eyebrow">{t.welcome}</p>
        <h1>{t.title}</h1>
      </header>

      {!tabletLabel && (
        <section className="setup-section">
          <h2>{t.setupTitle}</h2>
          <p>{t.setupText}</p>

          <label htmlFor="setup-tablet">{t.tablet}</label>
          <select
            id="setup-tablet"
            value={setupTablet}
            onChange={(event) =>
              setSetupTablet(event.target.value as TabletLabel)
            }
          >
            {TABLETS.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!isReady || isChangingTablet}
            onClick={() => void saveTablet(setupTablet)}
          >
            {t.saveSetup}
          </button>
        </section>
      )}

      <form onSubmit={handleSubmit} className="registration-form">
        <h2>{t.details}</h2>

        <label htmlFor="name">{t.name}</label>
        <input
          id="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t.namePlaceholder}
          autoComplete="name"
          required
          disabled={!isReady || isBusy || !tabletLabel}
        />

        <label htmlFor="phone">{t.phone}</label>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder={t.phonePlaceholder}
          maxLength={16}
          autoComplete="tel"
          required
          disabled={!isReady || isBusy || !tabletLabel}
        />

        <label htmlFor="city">{t.city}</label>
        <input
          id="city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          placeholder={t.cityPlaceholder}
          autoComplete="address-level2"
          required
          disabled={!isReady || isBusy || !tabletLabel}
        />

        <button
          type="submit"
          disabled={!isReady || isBusy || !tabletLabel}
        >
          {isSaving ? t.saving : t.save}
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
        <h2>{t.status}</h2>

        {!countsLoaded ? (
          <p>{t.loadingCounts}</p>
        ) : (
          <>
            <div className="count-row">
              <span>{t.pending}</span>
              <strong key={`pending-${pendingCount}`}>
                {pendingCount}
              </strong>
            </div>

            <div className="count-row">
              <span>{t.synced}</span>
              <strong key={`synced-${syncedCount}`}>
                {syncedCount}
              </strong>
            </div>
          </>
        )}
      </section>

      <section className="sync-section">
        <h2>{t.syncTitle}</h2>
        <p>{t.syncDescription}</p>

        <button
          type="button"
          onClick={() => void prepareBatches(false)}
          disabled={!isReady || isBusy || !tabletLabel}
        >
          {isPreparing ? t.preparing : t.prepareSync}
        </button>

        <p className="help-text">{t.exportDescription}</p>

        <button
          type="button"
          className="secondary-button"
          onClick={() => void prepareBatches(true)}
          disabled={!isReady || isBusy || !tabletLabel}
        >
          {isPreparing ? t.preparing : t.exportEverything}
        </button>
      </section>

      {batches.length > 0 && (
        <section className="batch-section">
          <h2>{t.batchesTitle}</h2>
          <p className="help-text">{t.helpBatch}</p>

          {batches.map((batch) => (
            <article
              className="batch-item"
              key={batch.batchNumber}
            >
              <h3>
                {t.files} {batch.batchNumber}
              </h3>

              <p>
                {t.files}: {batch.files.length}
              </p>

              <p>
                {t.registrations}: {batch.recordCount}
              </p>

              <ul>
                {batch.files.map((file) => (
                  <li key={file.fileName}>
                    {file.fileName} ({file.recordCount})
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => void handleShare(batch)}
                disabled={!isReady || isBusy}
              >
                {sharingBatchNumber === batch.batchNumber
                  ? t.sharing
                  : t.share}
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default App;