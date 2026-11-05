import { describe, expect, it } from 'vitest';

import {
  normalizeIndianPhone,
  validatePersonName,
} from '../database/database.ts';

// The same rule is used for both the Name and the City field.

describe('validatePersonName: accepts real names and cities', () => {
  it.each([
    'Rohit Kulkarni',
    'Pune',
    'Navi Mumbai',
    'रोहित कुलकर्णी',
    'सुनील पाटील',
    'श्रीकृष्ण',
    // Hyphenated names and cities (Pimpri-Chinchwad is a common Pune city).
    'Pimpri-Chinchwad',
    'पिंपरी-चिंचवड',
    'Joshi-Patil',
    // Initials with dots, written before or after the surname.
    'R. K. Patil',
    'Patil R.',
    'St. Louis',
    // Apostrophes, straight and curly.
    "O'Brien",
    'D’Souza',
    // Devanagari joiners inside or at the end of a word.
    'क्ष‌त्रिय',
    'दुर्गा‍',
  ])('accepts %s', (value) => {
    expect(validatePersonName(value)).toBe(true);
  });

  it('ignores extra spaces around and inside the text', () => {
    expect(validatePersonName('  Rohit    Kulkarni  ')).toBe(true);
  });
});

describe('validatePersonName: rejects anything else', () => {
  it.each([
    ['empty text', ''],
    ['only spaces', '   '],
    ['digits in a name', 'Anil Kumar 2'],
    ['only digits (a pincode)', '411038'],
    ['formula that spreadsheets would run', '=SUM(A1)'],
    ['formula starting with @', '@home'],
    ['formula starting with a plus sign', '+91 Rohit'],
    ['underscore', 'Rohit_K'],
    ['starts with a hyphen', '-Patil'],
    ['only dots', '..'],
    ['markup', 'Name<script>'],
    ['control character', 'Rohit\u0000K'],
    ['emoji', '😀 Smith'],
    ['comma', 'Patil, Rohit'],
  ])('rejects %s', (_label, value) => {
    expect(validatePersonName(value)).toBe(false);
  });
});

describe('normalizeIndianPhone', () => {
  it.each([
    ['9876543210', '9876543210'],
    ['+91 98765 43210', '9876543210'],
    ['+91-98765-43210', '9876543210'],
    ['919876543210', '9876543210'],
    ['09876543210', '9876543210'],
    ['(98765) 43210', '9876543210'],
    ['  9876543210  ', '9876543210'],
    ['6000000000', '6000000000'],
  ])('turns %s into %s', (input, expected) => {
    expect(normalizeIndianPhone(input)).toBe(expected);
  });

  it.each([
    ['too short', '98765'],
    ['too long', '98765432101'],
    ['starts with 5', '5876543210'],
    ['letters', '98765abcde'],
    ['empty', ''],
    ['landline style', '02012345678'],
  ])('rejects a number that is %s', (_label, input) => {
    expect(normalizeIndianPhone(input)).toBe('');
  });

  it('accepts the longest text the phone box allows (16 characters)', () => {
    // The phone input has maxLength 16; "+91 98765 43210" must not be cut.
    expect('+91 98765 43210'.length).toBeLessThanOrEqual(16);
    expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
  });
});
