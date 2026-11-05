import { describe, expect, it } from 'vitest';

import {
  CLOCK_TOLERANCE_MS,
  HEALTH_KEYS,
  STALE_EXPORT_HOURS,
  evaluateHealth,
  formatBuildLabel,
  type HealthId,
  type HealthInput,
  type HealthItem,
} from '../services/healthCheck.ts';
import {
  describeItem,
  describeWhen,
  healthText,
  type HealthLanguage,
} from '../services/healthText.ts';

const HOUR = 60 * 60 * 1000;
const BUILD_TIME = Date.UTC(2026, 10, 10, 12, 0, 0); // 10 Nov 2026, 12:00 UTC
const NOW = BUILD_TIME + 4 * 24 * HOUR;

// A device that is fully set up and has nothing waiting.
function goodInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    serviceWorkerActive: true,
    precacheReady: true,
    standalone: true,
    tabletLabel: 'T3',
    canShareFiles: true,
    pendingCount: 0,
    lastExportAt: NOW - 2 * HOUR,
    now: NOW,
    buildTime: BUILD_TIME,
    storagePersisted: true,
    ...overrides,
  };
}

function item(input: HealthInput, id: HealthId): HealthItem {
  const found = evaluateHealth(input).items.find((entry) => entry.id === id);

  if (!found) throw new Error(`No item ${id}`);

  return found;
}

describe('evaluateHealth: a fully set up iPad', () => {
  it('has no warnings and lists every check once', () => {
    const report = evaluateHealth(goodInput());

    expect(report.attention).toBe(0);
    expect(report.items.map((entry) => entry.id)).toEqual([
      'offline',
      'homeScreen',
      'tablet',
      'sharing',
      'unexported',
      'clock',
      'storage',
      'version',
    ]);
  });
});

describe('evaluateHealth: offline, Home Screen, tablet, sharing', () => {
  it('warns when the service worker is not active', () => {
    expect(item(goodInput({ serviceWorkerActive: false }), 'offline').key).toBe(
      'offline.warn',
    );
  });

  it('warns when the start page is not in the offline cache', () => {
    expect(item(goodInput({ precacheReady: false }), 'offline').status).toBe(
      'warn',
    );
  });

  it('warns when opened in a Safari tab instead of the Home Screen', () => {
    expect(item(goodInput({ standalone: false }), 'homeScreen').key).toBe(
      'homeScreen.warn',
    );
  });

  it('shows the tablet number, and warns when none is chosen', () => {
    const chosen = item(goodInput({ tabletLabel: 'T5' }), 'tablet');
    const missing = item(goodInput({ tabletLabel: '' }), 'tablet');

    expect(chosen.status).toBe('ok');
    expect(chosen.params.tablet).toBe('T5');
    expect(missing.status).toBe('warn');
  });

  it('warns when files cannot be shared', () => {
    expect(item(goodInput({ canShareFiles: false }), 'sharing').key).toBe(
      'sharing.warn',
    );
  });
});

describe('evaluateHealth: guests not yet sent', () => {
  it('is fine when nothing is waiting, even if nothing was ever shared', () => {
    const result = item(
      goodInput({ pendingCount: 0, lastExportAt: null }),
      'unexported',
    );

    expect(result.status).toBe('ok');
    expect(result.key).toBe('unexported.none');
  });

  it('is fine when guests wait but a share happened recently', () => {
    const result = item(
      goodInput({ pendingCount: 40, lastExportAt: NOW - 3 * HOUR }),
      'unexported',
    );

    expect(result.status).toBe('ok');
    expect(result.key).toBe('unexported.recent');
    expect(result.params).toEqual({ n: 40, hours: 3 });
  });

  it('warns when guests wait and nothing was ever shared', () => {
    const result = item(
      goodInput({ pendingCount: 5, lastExportAt: null }),
      'unexported',
    );

    expect(result.status).toBe('warn');
    expect(result.key).toBe('unexported.stale');
    expect(result.params.hours).toBeNull();
  });

  it('switches from fine to a warning at the stale limit', () => {
    const justBefore = item(
      goodInput({
        pendingCount: 5,
        lastExportAt: NOW - (STALE_EXPORT_HOURS - 1) * HOUR - 30 * 60 * 1000,
      }),
      'unexported',
    );
    const atLimit = item(
      goodInput({
        pendingCount: 5,
        lastExportAt: NOW - STALE_EXPORT_HOURS * HOUR,
      }),
      'unexported',
    );

    expect(justBefore.status).toBe('ok');
    expect(atLimit.status).toBe('warn');
  });

  it('treats a share time in the future (wrong clock) as 0 hours ago', () => {
    const result = item(
      goodInput({ pendingCount: 2, lastExportAt: NOW + 5 * HOUR }),
      'unexported',
    );

    expect(result.params.hours).toBe(0);
  });
});

describe('evaluateHealth: clock, storage, version', () => {
  it('accepts a clock at or after the build time', () => {
    expect(item(goodInput({ now: BUILD_TIME }), 'clock').status).toBe('ok');
  });

  it('accepts a clock slightly behind the build time', () => {
    const now = BUILD_TIME - CLOCK_TOLERANCE_MS + 1000;

    expect(item(goodInput({ now }), 'clock').status).toBe('ok');
  });

  it('warns when the clock is well behind the build time', () => {
    const now = BUILD_TIME - CLOCK_TOLERANCE_MS - 1000;

    expect(item(goodInput({ now }), 'clock').key).toBe('clock.warn');
  });

  it('shows protected storage as fine', () => {
    expect(item(goodInput({ storagePersisted: true }), 'storage').key).toBe(
      'storage.ok',
    );
  });

  it('shows unknown or unprotected storage as information, not a warning', () => {
    for (const value of [null, false]) {
      const report = evaluateHealth(goodInput({ storagePersisted: value }));
      const storage = report.items.find((entry) => entry.id === 'storage');

      expect(storage?.status).toBe('neutral');
      expect(report.attention).toBe(0);
    }
  });

  it('shows the build time in UTC', () => {
    expect(formatBuildLabel(BUILD_TIME)).toBe('2026-11-10 12:00 UTC');
    expect(item(goodInput(), 'version').params.version).toBe(
      '2026-11-10 12:00 UTC',
    );
  });
});

describe('evaluateHealth: attention count', () => {
  it('counts only warnings', () => {
    const report = evaluateHealth(
      goodInput({
        serviceWorkerActive: false,
        standalone: false,
        tabletLabel: '',
        storagePersisted: null,
      }),
    );

    expect(report.attention).toBe(3);
  });
});

describe('texts in English, Hindi and Marathi', () => {
  const languages: HealthLanguage[] = ['en', 'hi', 'mr'];

  it.each(languages)('%s has a text for every check result', (language) => {
    for (const key of HEALTH_KEYS) {
      expect(healthText[language].values[key]?.trim()).toBeTruthy();
    }
  });

  it.each(languages)('%s has a label for every check', (language) => {
    const ids = evaluateHealth(goodInput()).items.map((entry) => entry.id);

    for (const id of ids) {
      expect(healthText[language].labels[id]?.trim()).toBeTruthy();
    }
  });

  it.each(languages)(
    '%s keeps the placeholders its messages need',
    (language) => {
      const { values } = healthText[language];

      expect(values['tablet.ok']).toContain('{tablet}');
      expect(values['version.info']).toContain('{version}');

      for (const key of ['unexported.recent', 'unexported.stale'] as const) {
        expect(values[key]).toContain('{n}');
        expect(values[key]).toContain('{when}');
      }
    },
  );

  it.each(languages)(
    '%s leaves no placeholder visible after filling in a message',
    (language) => {
      const text = healthText[language];
      const reports = [
        evaluateHealth(goodInput()),
        evaluateHealth(
          goodInput({
            serviceWorkerActive: false,
            standalone: false,
            tabletLabel: '',
            canShareFiles: false,
            pendingCount: 12,
            lastExportAt: null,
            now: BUILD_TIME - 5 * HOUR,
            storagePersisted: null,
          }),
        ),
        evaluateHealth(goodInput({ pendingCount: 12 })),
      ];

      for (const report of reports) {
        for (const entry of report.items) {
          const shown = describeItem(text, entry);

          expect(shown).not.toMatch(/[{}]/);
          expect(shown.trim()).not.toBe('');
        }
      }
    },
  );
});

describe('describeItem and describeWhen in English', () => {
  const en = healthText.en;

  it('says "never" when nothing was shared', () => {
    expect(describeWhen(en, null)).toBe('never');
  });

  it('describes recent times in hours and days', () => {
    expect(describeWhen(en, 0)).toBe('less than 1 hour ago');
    expect(describeWhen(en, 5)).toBe('5 hour(s) ago');
    expect(describeWhen(en, 47)).toBe('47 hour(s) ago');
    expect(describeWhen(en, 48)).toBe('2 day(s) ago');
    expect(describeWhen(en, 100)).toBe('4 day(s) ago');
  });

  it('writes the waiting guests and the last share time', () => {
    const waiting = item(
      goodInput({ pendingCount: 40, lastExportAt: NOW - 3 * HOUR }),
      'unexported',
    );
    const never = item(
      goodInput({ pendingCount: 7, lastExportAt: null }),
      'unexported',
    );

    expect(describeItem(en, waiting)).toBe('40 waiting. Last sent: 3 hour(s) ago');
    expect(describeItem(en, never)).toBe('7 not sent yet. Last sent: never');
  });

  it('writes the tablet number and the title line', () => {
    expect(describeItem(en, item(goodInput({ tabletLabel: 'T6' }), 'tablet'))).toBe(
      'T6',
    );
    expect(en.attention(2)).toBe('2 check(s) need attention');
  });
});
