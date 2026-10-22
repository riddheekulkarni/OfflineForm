
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';

import {
  createTable,
  addRegistration,
  getRegistrationCounts,
} from './src/database/database';

import { syncByEmail } from './src/services/emailService';

export default function App() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [pending, setPending] = useState(0);
  const [synced, setSynced] = useState(0);
  const [ready, setReady] = useState(false);

  async function updateCounts() {
    const counts = await getRegistrationCounts();
    setPending(counts.pending);
    setSynced(counts.synced);
  }

  useEffect(() => {
    async function setup() {
      try {
        await createTable();
        await updateCounts();
        setReady(true);
      } catch (error) {
        Alert.alert(
          'Error',
          'Could not open the local database.'
        );
      }
    }

    setup();
  }, []);

  async function saveRegistration() {
    try {
      await addRegistration(name, phone, city);
      await updateCounts();

      setName('');
      setPhone('');
      setCity('');

      Alert.alert(
        'Success',
        'Registration saved on this device.'
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Could not save registration.';

      Alert.alert('Registration Error', message);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Event Registration</Text>

      <Text style={styles.subtitle}>
        Enter participant details
      </Text>

      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter full name"
        value={name}
        onChangeText={setName}
      />

      <Text style={styles.label}>Phone Number</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter 10-digit mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="number-pad"
        maxLength={10}
      />

      <Text style={styles.label}>City</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter city"
        value={city}
        onChangeText={setCity}
      />

      <Button
        title="Save Registration"
        onPress={saveRegistration}
        disabled={!ready}
      />

      <View style={styles.csvButton}>
        <Button
          title="Sync / Generate CSV"
          onPress={() => syncByEmail(updateCounts)}
          disabled={!ready}
        />
      </View>

      <View style={styles.status}>
        <Text style={styles.statusTitle}>
          Registration Status
        </Text>

        <Text>Pending: {pending}</Text>
        <Text>Synced: {synced}</Text>
      </View>

      {!ready && (
        <Text>Preparing local database...</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#F5F7FA',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#17365D',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    color: '#555555',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CCCCCC',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  csvButton: {
    marginTop: 12,
  },
  status: {
    marginTop: 28,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    gap: 8,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
});
