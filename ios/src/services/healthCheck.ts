// Device check: a short list of things a volunteer can look at to see whether
// this iPad is set up for the event. evaluateHealth() is pure (no browser
// APIs) so it can be tested; collectHealthInput() reads the browser.

export type HealthId =
  | 'offline'
  | 'homeScreen'
  | 'tablet'
  | 'sharing'
  | 'unexported'
  | 'clock'
  | 'storage'
  | 'version';

// ok = fine, warn = needs attention, neutral = information only.
export type HealthStatus = 'ok' | 'warn' | 'neutral';

export type HealthKey =
  | 'offline.ok'
  | 'offline.warn'
  | 'homeScreen.ok'
  | 'homeScreen.warn'
  | 'tablet.ok'
  | 'tablet.warn'
  | 'sharing.ok'
  | 'sharing.warn'
  | 'unexported.none'
  | 'unexported.recent'
  | 'unexported.stale'
  | 'clock.ok'
  | 'clock.warn'
  | 'storage.ok'
  | 'storage.unknown'
  | 'version.info';

// Every key that evaluateHealth() can produce. The tests use this list to
// make sure each language has a text for every key.
export const HEALTH_KEYS: readonly HealthKey[] = [
  'offline.ok',
  'offline.warn',
  'homeScreen.ok',
  'homeScreen.warn',
  'tablet.ok',
  'tablet.warn',
  'sharing.ok',
  'sharing.warn',
  'unexported.none',
  'unexported.recent',
  'unexported.stale',
  'clock.ok',
  'clock.warn',
  'storage.ok',
  'storage.unknown',
  'version.info',
];

export interface HealthParams {
  n?: number;
  // Whole hours since the last confirmed share, or null if never shared.
  hours?: number | null;
  tablet?: string;
  version?: string;
}

export interface HealthItem {
  id: HealthId;
  status: HealthStatus;
  key: HealthKey;
  params: HealthParams;
}

export interface HealthInput {
  serviceWorkerActive: boolean;
  // True when the offline cache contains the app's start page.
  precacheReady: boolean;
  // True when running from the Home Screen icon, not a Safari tab.
  standalone: boolean;
  tabletLabel: string;
  canShareFiles: boolean;
  pendingCount: number;
  // Time (ms since 1970) of the last confirmed share, or null.
  lastExportAt: number | null;
  now: number;
  // Time (ms since 1970) when this build was made.
  buildTime: number;
  // true = protected, null = the browser does not say.
  storagePersisted: boolean | null;
}

export interface HealthReport {
  items: HealthItem[];
  // Number of items with status 'warn'.
  attention: number;
}

// Pending guests older than this since the last share are flagged.
export const STALE_EXPORT_HOURS = 18;

// A device clock this far behind the build time is treated as wrong.
export const CLOCK_TOLERANCE_MS = 2 * 60 * 60 * 1000;

export function formatBuildLabel(buildTime: number): string {
  return `${new Date(buildTime).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function evaluateHealth(input: HealthInput): HealthReport {
  const items: HealthItem[] = [];

  const offlineReady = input.serviceWorkerActive && input.precacheReady;
  items.push({
    id: 'offline',
    status: offlineReady ? 'ok' : 'warn',
    key: offlineReady ? 'offline.ok' : 'offline.warn',
    params: {},
  });

  items.push({
    id: 'homeScreen',
    status: input.standalone ? 'ok' : 'warn',
    key: input.standalone ? 'homeScreen.ok' : 'homeScreen.warn',
    params: {},
  });

  const hasTablet = input.tabletLabel !== '';
  items.push({
    id: 'tablet',
    status: hasTablet ? 'ok' : 'warn',
    key: hasTablet ? 'tablet.ok' : 'tablet.warn',
    params: { tablet: input.tabletLabel },
  });

  items.push({
    id: 'sharing',
    status: input.canShareFiles ? 'ok' : 'warn',
    key: input.canShareFiles ? 'sharing.ok' : 'sharing.warn',
    params: {},
  });

  const hours =
    input.lastExportAt === null
      ? null
      : Math.max(
          0,
          Math.floor((input.now - input.lastExportAt) / (60 * 60 * 1000)),
        );

  if (input.pendingCount === 0) {
    items.push({
      id: 'unexported',
      status: 'ok',
      key: 'unexported.none',
      params: { n: 0, hours },
    });
  } else if (hours === null || hours >= STALE_EXPORT_HOURS) {
    items.push({
      id: 'unexported',
      status: 'warn',
      key: 'unexported.stale',
      params: { n: input.pendingCount, hours },
    });
  } else {
    items.push({
      id: 'unexported',
      status: 'ok',
      key: 'unexported.recent',
      params: { n: input.pendingCount, hours },
    });
  }

  const clockOk = input.now >= input.buildTime - CLOCK_TOLERANCE_MS;
  items.push({
    id: 'clock',
    status: clockOk ? 'ok' : 'warn',
    key: clockOk ? 'clock.ok' : 'clock.warn',
    params: {},
  });

  // iOS 15 often cannot tell, so "unknown" is information, not a warning.
  items.push({
    id: 'storage',
    status: input.storagePersisted === true ? 'ok' : 'neutral',
    key: input.storagePersisted === true ? 'storage.ok' : 'storage.unknown',
    params: {},
  });

  items.push({
    id: 'version',
    status: 'neutral',
    key: 'version.info',
    params: { version: formatBuildLabel(input.buildTime) },
  });

  return {
    items,
    attention: items.filter((item) => item.status === 'warn').length,
  };
}

interface CollectArgs {
  tabletLabel: string;
  pendingCount: number;
  lastExportAt: number | null;
  buildTime: number;
}

async function isServiceWorkerActive(): Promise<boolean> {
  try {
    if (!('serviceWorker' in navigator)) return false;

    const registration = await navigator.serviceWorker.getRegistration();

    return Boolean(registration?.active);
  } catch {
    return false;
  }
}

async function isPrecacheReady(): Promise<boolean> {
  try {
    if (!('caches' in window)) return false;

    const names = await caches.keys();

    for (const name of names) {
      if (!name.includes('precache')) continue;

      const cache = await caches.open(name);
      const requests = await cache.keys();

      if (
        requests.some((request) => {
          const path = new URL(request.url).pathname;
          return path === '/index.html' || path === '/';
        })
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  try {
    const legacy = (navigator as Navigator & { standalone?: boolean })
      .standalone;

    return (
      legacy === true ||
      window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

function canShareFiles(): boolean {
  try {
    if (
      typeof navigator.share !== 'function' ||
      typeof navigator.canShare !== 'function'
    ) {
      return false;
    }

    const probe = new File(['check'], 'check.csv', {
      type: 'text/csv;charset=utf-8',
    });

    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

async function isStoragePersisted(): Promise<boolean | null> {
  try {
    if (!navigator.storage || typeof navigator.storage.persisted !== 'function') {
      return null;
    }

    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}

export async function collectHealthInput(
  args: CollectArgs,
): Promise<HealthInput> {
  const [serviceWorkerActive, precacheReady, storagePersisted] =
    await Promise.all([
      isServiceWorkerActive(),
      isPrecacheReady(),
      isStoragePersisted(),
    ]);

  return {
    serviceWorkerActive,
    precacheReady,
    standalone: isStandalone(),
    tabletLabel: args.tabletLabel,
    canShareFiles: canShareFiles(),
    pendingCount: args.pendingCount,
    lastExportAt: args.lastExportAt,
    now: Date.now(),
    buildTime: args.buildTime,
    storagePersisted,
  };
}
