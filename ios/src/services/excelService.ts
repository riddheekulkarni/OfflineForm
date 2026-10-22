
import * as XLSX from 'xlsx';
import type { Registration } from '../database/database';

export function downloadExcelFile(
  registrations: Registration[]
): void {
  if (registrations.length === 0) {
    throw new Error('There are no registrations to export.');
  }

  const rows = registrations.map((registration) => ({
    Name: registration.name,
    Phone: String(registration.phone),
    City: registration.city,
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set automatic, readable widths for all three columns.
  worksheet['!cols'] = [
    { wch: Math.max(20, ...rows.map((row) => row.Name.length + 2)) },
    { wch: 16 },
    { wch: Math.max(15, ...rows.map((row) => row.City.length + 2)) },
  ];

  // Keep phone numbers as text to avoid scientific notation.
  for (let row = 2; row <= rows.length + 1; row++) {
    const phoneCell = worksheet[`B${row}`];

    if (phoneCell) {
      phoneCell.t = 's';
      phoneCell.v = String(phoneCell.v);
    }
  }

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    'Registrations'
  );

  XLSX.writeFile(
    workbook,
    `registrations_${new Date().toISOString().slice(0, 10)}.xlsx`
  );
}
