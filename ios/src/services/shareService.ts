
import type { CSVFile } from './csvService';

export async function shareCSVFiles(files: CSVFile[]): Promise<void> {
  if (files.length === 0) {
    throw new Error('There are no CSV files to share.');
  }

  if (files.length > 5) {
    throw new Error('A maximum of five CSV files can be shared at once.');
  }

  const attachments = files.map(
    (csv) =>
      new File([csv.content], csv.fileName, {
        type: 'text/csv;charset=utf-8',
      })
  );

  if (typeof navigator.share !== 'function') {
    throw new Error(
      'Sharing is unavailable in this browser. Open the deployed app in Safari on your iPad.'
    );
  }

  if (
    typeof navigator.canShare !== 'function' ||
    !navigator.canShare({ files: attachments })
  ) {
    throw new Error(
      'This browser cannot share these CSV attachments. The registrations remain pending.'
    );
  }

  await navigator.share({
    files: attachments,
  });
}
