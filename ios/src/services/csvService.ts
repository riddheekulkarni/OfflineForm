
import type { Registration } from '../database/database';

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
  return `"${value.replace(/"/g, '""')}"`;
}


function createCSVContent(registrations: Registration[]): string {
  const header = 'Name,Phone,City';

  const rows = registrations.map((registration) => {
    return [
      escapeCSVValue(registration.name),
      escapeCSVValue(registration.phone),
      escapeCSVValue(registration.city),
    ].join(',');
  });

  return [header, ...rows].join('\r\n');
}


export function createCSVFiles(
  registrations: Registration[]
): CSVFile[] {
  const files: CSVFile[] = [];

  for (
    let start = 0;
    start < registrations.length;
    start += MAX_RECORDS_PER_CSV
  ) {
    const group = registrations.slice(
      start,
      start + MAX_RECORDS_PER_CSV
    );

    const csvContent = createCSVContent(group);

    const fileNumber = files.length + 1;

    files.push({
      fileName: `registrations_${fileNumber}.csv`,
      content: '\uFEFF' + csvContent,
      recordCount: group.length,
    });
  }

  return files;
}

export function createEmailBatches(
  csvFiles: CSVFile[]
): EmailBatch[] {
  const batches: EmailBatch[] = [];

  for (
    let start = 0;
    start < csvFiles.length;
    start += MAX_CSV_FILES_PER_EMAIL
  ) {
    const files = csvFiles.slice(
      start,
      start + MAX_CSV_FILES_PER_EMAIL
    );

    let recordCount = 0;

    for (const file of files) {
      recordCount += file.recordCount;
    }

    batches.push({
      batchNumber: batches.length + 1,
      files,
      recordCount,
    });
  }

  return batches;
}

export function downloadCSVFile(file: CSVFile): void {
  const blob = new Blob([file.content], {
    type: 'text/csv;charset=utf-8;',
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = file.fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
