
import * as MailComposer from 'expo-mail-composer';
import { Alert } from 'react-native';
import { createCSVFilesFromRecords } from './csvService';
import {
  RECIPIENT_EMAIL,
  EMAIL_SUBJECT,
} from '../config/emailConfig';
import {
  getPendingRegistrations,
  markRegistrationsAsSynced,
} from '../database/database';

const MAX_ATTACHMENTS_PER_EMAIL = 5;

type Registration = {
  name: string;
  phone: string;
  city: string;
  sync_id: string;
};

export async function syncByEmail(
  onSyncComplete: () => Promise<void>
) {
  try {
    const records: Registration[] =
      await getPendingRegistrations();

    if (records.length === 0) {
      Alert.alert(
        'No Pending Registrations',
        'There are no pending registrations to export.'
      );
      return;
    }

    const available = await MailComposer.isAvailableAsync();

    if (!available) {
      Alert.alert(
        'Email Not Available',
        'No compatible email composer is available on this device.'
      );
      return;
    }

    const recordsPerEmail = MAX_ATTACHMENTS_PER_EMAIL * 250;
    const totalEmails = Math.ceil(
      records.length / recordsPerEmail
    );

    Alert.alert(
      'Prepare Export',
      'Pending registrations: ' + records.length +
        '\nCSV files will contain up to 250 registrations each.' +
        '\nMaximum attachments per email: ' +
        MAX_ATTACHMENTS_PER_EMAIL +
        '\nEmails needed: ' + totalEmails,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Continue',
          onPress: async () => {
            await sendEmailBatches(records, onSyncComplete);
          },
        },
      ]
    );
  } catch (error) {
    console.log('Email preparation error:', error);
    Alert.alert('Error', 'Could not prepare the export.');
  }
}

async function sendEmailBatches(
  records: Registration[],
  onSyncComplete: () => Promise<void>
) {
  const recordsPerEmail = MAX_ATTACHMENTS_PER_EMAIL * 250;
  let sentEmailCount = 0;

  for (
    let start = 0;
    start < records.length;
    start += recordsPerEmail
  ) {
    const batch = records.slice(
      start,
      start + recordsPerEmail
    );

    const batchNumber = sentEmailCount + 1;
    const prefix =
      'registrations_' + Date.now() + '_' + batchNumber;

    try {
      const files = await createCSVFilesFromRecords(
        batch,
        prefix
      );

      if (files.length === 0) {
        Alert.alert(
          'Export Stopped',
          'Could not create CSV files. Remaining registrations are still pending.'
        );
        return;
      }

      const result = await MailComposer.composeAsync({
        recipients: [RECIPIENT_EMAIL],
        subject:
          EMAIL_SUBJECT +
          ' (' + batchNumber + ')',
        body:
          'Event registration export, email ' +
          batchNumber + '.\nRegistrations in this batch: ' +
          batch.length +
          '\nPlease find the CSV files attached.',
        attachments: files,
      });

      if (result.status !== 'sent') {
        Alert.alert(
          'Export Paused',
          'This email was not confirmed as sent. Its registrations and all remaining registrations stay pending.',
        );
        return;
      }

      const confirmed = await askForSendConfirmation(
        batchNumber,
        totalEmailCount(records)
      );

      if (!confirmed) {
        Alert.alert(
          'Export Paused',
          'Registrations in this email and all remaining registrations stay pending.',
        );
        return;
      }

      const syncIds = batch.map(
        (record) => record.sync_id
      );

      await markRegistrationsAsSynced(syncIds);
      sentEmailCount++;

      await onSyncComplete();
    } catch (error) {
      console.log('Email batch error:', error);
      Alert.alert(
        'Export Stopped',
        'Could not complete this email. Remaining registrations stay pending.'
      );
      return;
    }
  }

  Alert.alert(
    'Export Complete',
    'All ' + records.length +
      ' registrations have been processed across ' +
      sentEmailCount + ' emails.'
  );
}

function totalEmailCount(records: Registration[]) {
  return Math.ceil(
    records.length / (MAX_ATTACHMENTS_PER_EMAIL * 250)
  );
}

function askForSendConfirmation(
  currentEmail: number,
  totalEmails: number
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      'Confirm Email ' + currentEmail + ' of ' + totalEmails,
      'Did you tap Send for this email in your email app?',
      [
        {
          text: 'No',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Yes, I Sent It',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: false }
    );
  });
}
