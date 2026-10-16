
import * as FileSystem from 'expo-file-system/legacy';
import { getPendingRegistrations } from '../database/database';

const MAX_RECORDS_PER_CSV = 250;

type Registration = {
  name: string;
  phone: string;
  city: string;
};

export async function createCSVFiles() {
  const records = await getPendingRegistrations();

  return createCSVFilesFromRecords(records);
}

export async function createCSVFilesFromRecords(
  records: Registration[],
  filePrefix = 'registrations'
) {
  if (records.length === 0) {
    return [];
  }

  const files: string[] = [];

  for (let i = 0; i < records.length; i += MAX_RECORDS_PER_CSV) {
    const batch = records.slice(i, i + MAX_RECORDS_PER_CSV);

    let csv = 'Name,Phone,City\n';

    for (const record of batch) {
      const row = [
        record.name,
        record.phone,
        record.city,
      ];

      const escapedRow = row.map((value) => {
        const text = String(value ?? '');
        return '"' + text.replace(/"/g, '""') + '"';
      });

      csv += escapedRow.join(',') + '\n';
    }

    const fileName =
      filePrefix + '_' + (files.length + 1) + '.csv';

    const fileUri = FileSystem.documentDirectory + fileName;

    await FileSystem.writeAsStringAsync(fileUri, csv);

    files.push(fileUri);
  }

  return files;
}
