
import type { Registration } from '../database/database.ts';
import { normalizeIndianPhone } from '../database/database.ts';

export const MAX_RECORDS_PER_CSV = 250;
export const MAX_CSV_FILES_PER_EMAIL = 5;

export interface CSVFile {
  fileName: string;
  content: string;
  recordCount: number;
}

export interface EmailBatch {
  batchNumber: number;
  files: CSVFile[];
  recordCount: number;
}

function escapeCSVValue(value: string): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part: number) => String(part).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function createCSVContent(
  registrations: Registration[],
  tabletLabel: string,
  allRegistrations: Registration[],
): string {
  const phoneCounts = new Map<string, number>();

  for (const registration of allRegistrations) {
    const phone = normalizeIndianPhone(registration.phone);

    if (phone) {
      phoneCounts.set(phone, (phoneCounts.get(phone) ?? 0) + 1);
    }
  }

  const header = 'Tab,Name,Phone,Shared Phone,City,Timestamp';

  const rows = registrations.map((registration) => {
    const phone =
      normalizeIndianPhone(registration.phone) || registration.phone;

    const sharedPhone =
      (phoneCounts.get(phone) ?? 0) > 1 ? 'Yes' : '';

    return [
      registration.tablet_label || tabletLabel,
      registration.name,
      phone,
      sharedPhone,
      registration.city,
      formatTimestamp(registration.created_at ?? ''),
    ]
      .map((value) => escapeCSVValue(String(value ?? '')))
      .join(',');
  });

  return [header, ...rows].join('\r\n');
}

export function createCSVFiles(
  registrations: Registration[],
  tabletLabel = 'T1',
  allRegistrations: Registration[] = registrations,
): CSVFile[] {
  if (registrations.length === 0) {
    return [];
  }

  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');

  // Use local device time so the filename is easy to understand.
  const timestamp =
    `${now.getFullYear()}` +
    `${pad(now.getMonth() + 1)}` +
    `${pad(now.getDate())}_` +
    `${pad(now.getHours())}` +
    `${pad(now.getMinutes())}` +
    `${pad(now.getSeconds())}`;

  const safeTablet = /^T[1-7]$/.test(tabletLabel)
    ? tabletLabel
    : 'T1';

  const files: CSVFile[] = [];

  for (
    let start = 0;
    start < registrations.length;
    start += MAX_RECORDS_PER_CSV
  ) {
    const group = registrations.slice(
      start,
      start + MAX_RECORDS_PER_CSV,
    );

    const partNumber = String(files.length + 1).padStart(2, '0');

    files.push({
      fileName: `${safeTablet}_${timestamp}_${partNumber}.csv`,
      content:
        '\uFEFF' + createCSVContent(group, safeTablet, allRegistrations),
      recordCount: group.length,
    });
  }

  return files;
}

export function createEmailBatches(
  csvFiles: CSVFile[],
): EmailBatch[] {
  const batches: EmailBatch[] = [];

  for (
    let start = 0;
    start < csvFiles.length;
    start += MAX_CSV_FILES_PER_EMAIL
  ) {
    const files = csvFiles.slice(
      start,
      start + MAX_CSV_FILES_PER_EMAIL,
    );

    batches.push({
      batchNumber: batches.length + 1,
      files,
      recordCount: files.reduce(
        (total, file) => total + file.recordCount,
        0,
      ),
    });
  }

  return batches;
}
