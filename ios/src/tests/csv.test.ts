import { describe, expect, it } from 'vitest';

import type { Registration } from '../database/database.ts';
import {
  createCSVFiles,
  createEmailBatches,
  MAX_CSV_FILES_PER_EMAIL,
  MAX_RECORDS_PER_CSV,
} from '../services/csvService.ts';

function makeRegistration(
  index: number,
  overrides: Partial<Registration> = {},
): Registration {
  return {
    id: index,
    name: `Guest ${String.fromCharCode(65 + (index % 26))}`,
    phone: String(9000000000 + index),
    city: 'Pune',
    sync_status: 'pending',
    created_at: '2026-11-14T10:30:00.000Z',
    namePhoneKey: `key-${index}`,
    tablet_label: 'T2',
    ...overrides,
  };
}

function manyRegistrations(count: number): Registration[] {
  return Array.from({ length: count }, (_, i) => makeRegistration(i + 1));
}

describe('createCSVFiles: file names and layout', () => {
  it('returns nothing when there are no registrations', () => {
    expect(createCSVFiles([], 'T1')).toEqual([]);
  });

  it('puts the tablet label, date, time and part number in the file name', () => {
    const [file] = createCSVFiles(manyRegistrations(3), 'T3');

    expect(file.fileName).toMatch(/^T3_\d{8}_\d{6}_01\.csv$/);
  });

  it('falls back to T1 when the label is not T1 to T7', () => {
    const [file] = createCSVFiles(manyRegistrations(1), 'T9');

    expect(file.fileName.startsWith('T1_')).toBe(true);
  });

  it('starts with a byte-order mark so Excel shows Marathi names', () => {
    const [file] = createCSVFiles(manyRegistrations(1), 'T1');

    expect(file.content.charCodeAt(0)).toBe(0xfeff);
  });

  it('has the expected header and one row per guest', () => {
    const [file] = createCSVFiles(manyRegistrations(2), 'T1');
    const lines = file.content.replace('﻿', '').split('\r\n');

    expect(lines[0]).toBe('Tab,Name,Phone,Shared Phone,City,Timestamp');
    expect(lines).toHaveLength(3);
    expect(file.recordCount).toBe(2);
  });

  it('writes Marathi names and cities unchanged', () => {
    const [file] = createCSVFiles(
      [
        makeRegistration(1, {
          name: 'रोहित कुलकर्णी',
          city: 'पिंपरी-चिंचवड',
        }),
      ],
      'T1',
    );

    expect(file.content).toContain('"रोहित कुलकर्णी"');
    expect(file.content).toContain('"पिंपरी-चिंचवड"');
  });

  it("uses each record's own tablet label, else the current tablet", () => {
    const [file] = createCSVFiles(
      [
        makeRegistration(1, { tablet_label: 'T5' }),
        makeRegistration(2, { tablet_label: undefined }),
      ],
      'T3',
    );
    const rows = file.content.replace('﻿', '').split('\r\n').slice(1);

    expect(rows[0].startsWith('"T5"')).toBe(true);
    expect(rows[1].startsWith('"T3"')).toBe(true);
  });

  it('cleans a phone number written as +91 into 10 digits', () => {
    const [file] = createCSVFiles(
      [makeRegistration(1, { phone: '+91 98765 43210' })],
      'T1',
    );

    expect(file.content).toContain('"9876543210"');
  });
});

describe('createCSVFiles: shared phone flag', () => {
  it('marks every row that shares a phone number', () => {
    const all = [
      makeRegistration(1, { name: 'Asha Patil', phone: '9876543210' }),
      makeRegistration(2, { name: 'Sunil Patil', phone: '9876543210' }),
      makeRegistration(3, { name: 'Neha Joshi', phone: '9123456789' }),
    ];
    const [file] = createCSVFiles(all, 'T1');
    const rows = file.content.replace('﻿', '').split('\r\n').slice(1);

    expect(rows[0]).toContain('"Yes"');
    expect(rows[1]).toContain('"Yes"');
    expect(rows[2]).not.toContain('"Yes"');
  });

  it('counts across all records even when only some are exported', () => {
    const all = [
      makeRegistration(1, { phone: '9876543210', sync_status: 'synced' }),
      makeRegistration(2, { phone: '9876543210' }),
    ];
    const [file] = createCSVFiles([all[1]], 'T1', all);

    expect(file.content).toContain('"Yes"');
  });
});

describe('createCSVFiles: splitting into files and email batches', () => {
  it('keeps up to the maximum records in one file', () => {
    const files = createCSVFiles(manyRegistrations(MAX_RECORDS_PER_CSV), 'T1');

    expect(files).toHaveLength(1);
    expect(files[0].recordCount).toBe(MAX_RECORDS_PER_CSV);
  });

  it('starts a second numbered file after the maximum', () => {
    const files = createCSVFiles(
      manyRegistrations(MAX_RECORDS_PER_CSV + 1),
      'T1',
    );

    expect(files).toHaveLength(2);
    expect(files[0].fileName).toMatch(/_01\.csv$/);
    expect(files[1].fileName).toMatch(/_02\.csv$/);
    expect(files[1].recordCount).toBe(1);
  });

  it('never loses or repeats a guest across files', () => {
    const total = MAX_RECORDS_PER_CSV * 2 + 37;
    const files = createCSVFiles(manyRegistrations(total), 'T1');
    const counted = files.reduce((sum, f) => sum + f.recordCount, 0);

    expect(counted).toBe(total);
  });

  it('groups files into email batches of at most five', () => {
    const files = createCSVFiles(
      manyRegistrations(MAX_RECORDS_PER_CSV * 6),
      'T1',
    );
    const batches = createEmailBatches(files);

    expect(files).toHaveLength(6);
    expect(batches).toHaveLength(2);
    expect(batches[0].files).toHaveLength(MAX_CSV_FILES_PER_EMAIL);
    expect(batches[1].files).toHaveLength(1);
    expect(batches[0].recordCount).toBe(
      MAX_RECORDS_PER_CSV * MAX_CSV_FILES_PER_EMAIL,
    );
    expect(batches.map((b) => b.batchNumber)).toEqual([1, 2]);
  });
});
