/**
 * Tests for phone number utilities
 * Critical for contact matching and SMS functionality
 */

import {
  normalizePhoneNumber,
  phonesMatch,
  findContactByPhone,
  getContactDisplayName,
  formatPhoneForDisplay,
  buildPhoneContactMap,
  resolveContactName,
} from '@/lib/phone-utils';
import type { Contact } from '@/lib/zeke-types';

describe('normalizePhoneNumber', () => {
  describe('US phone numbers', () => {
    it('should normalize 10-digit US number', () => {
      expect(normalizePhoneNumber('5551234567')).toBe('+15551234567');
    });

    it('should normalize formatted 10-digit number', () => {
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('555.123.4567')).toBe('+15551234567');
    });

    it('should handle 11-digit number with leading 1', () => {
      expect(normalizePhoneNumber('15551234567')).toBe('+15551234567');
      expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567');
      expect(normalizePhoneNumber('1-555-123-4567')).toBe('+15551234567');
    });
  });

  describe('International numbers', () => {
    it('should preserve international numbers', () => {
      expect(normalizePhoneNumber('+442012345678')).toBe('+442012345678');
      expect(normalizePhoneNumber('442012345678')).toBe('+442012345678');
    });

    it('should handle formatted international numbers', () => {
      expect(normalizePhoneNumber('+44 20 1234 5678')).toBe('+442012345678');
      expect(normalizePhoneNumber('+86-138-1234-5678')).toBe('+8613812345678');
    });
  });

  describe('Edge cases', () => {
    it('should return empty string for null/undefined', () => {
      expect(normalizePhoneNumber(null)).toBe('');
      expect(normalizePhoneNumber(undefined)).toBe('');
    });

    it('should return empty string for empty string', () => {
      expect(normalizePhoneNumber('')).toBe('');
      expect(normalizePhoneNumber('   ')).toBe('');
    });

    it('should return empty string for strings with no digits', () => {
      expect(normalizePhoneNumber('abc')).toBe('');
      expect(normalizePhoneNumber('()')).toBe('');
      expect(normalizePhoneNumber('---')).toBe('');
    });

    it('should handle numbers with extra characters', () => {
      // Note: Numbers with extensions get extra digits appended, which may not be desired
      // This test documents current behavior
      expect(normalizePhoneNumber('+1 (555) 123-4567 ext 123')).toBe('+115551234567123');
    });
  });

  describe('Short numbers', () => {
    it('should add +1 prefix to short numbers', () => {
      expect(normalizePhoneNumber('123')).toBe('+1123');
      expect(normalizePhoneNumber('5551234')).toBe('+15551234');
    });
  });
});

describe('phonesMatch', () => {
  it('should match identical numbers', () => {
    expect(phonesMatch('5551234567', '5551234567')).toBe(true);
    expect(phonesMatch('+15551234567', '+15551234567')).toBe(true);
  });

  it('should match same numbers in different formats', () => {
    expect(phonesMatch('5551234567', '(555) 123-4567')).toBe(true);
    expect(phonesMatch('+15551234567', '5551234567')).toBe(true);
    expect(phonesMatch('15551234567', '(555) 123-4567')).toBe(true);
    expect(phonesMatch('555-123-4567', '555.123.4567')).toBe(true);
  });

  it('should not match different numbers', () => {
    expect(phonesMatch('5551234567', '5559876543')).toBe(false);
    expect(phonesMatch('+15551234567', '+15559876543')).toBe(false);
  });

  it('should return false for null/undefined', () => {
    expect(phonesMatch(null, '5551234567')).toBe(false);
    expect(phonesMatch('5551234567', null)).toBe(false);
    expect(phonesMatch(null, null)).toBe(false);
    expect(phonesMatch(undefined, '5551234567')).toBe(false);
    expect(phonesMatch('5551234567', undefined)).toBe(false);
  });

  it('should return false for empty strings', () => {
    expect(phonesMatch('', '5551234567')).toBe(false);
    expect(phonesMatch('5551234567', '')).toBe(false);
    expect(phonesMatch('', '')).toBe(false);
  });

  it('should match international numbers in different formats', () => {
    expect(phonesMatch('+44 20 1234 5678', '442012345678')).toBe(true);
    expect(phonesMatch('+86-138-1234-5678', '8613812345678')).toBe(true);
  });
});

describe('findContactByPhone', () => {
  const mockContacts: Contact[] = [
    {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+15551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact,
    {
      id: '2',
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '(555) 987-6543',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact,
    {
      id: '3',
      firstName: 'Bob',
      lastName: 'Johnson',
      phoneNumber: '+442012345678',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact,
  ];

  it('should find contact by exact phone match', () => {
    const contact = findContactByPhone(mockContacts, '+15551234567');
    expect(contact).not.toBeNull();
    expect(contact?.firstName).toBe('John');
  });

  it('should find contact by phone in different format', () => {
    const contact = findContactByPhone(mockContacts, '5551234567');
    expect(contact).not.toBeNull();
    expect(contact?.firstName).toBe('John');
  });

  it('should find contact with formatted phone', () => {
    const contact = findContactByPhone(mockContacts, '555-987-6543');
    expect(contact).not.toBeNull();
    expect(contact?.firstName).toBe('Jane');
  });

  it('should return null when no match found', () => {
    const contact = findContactByPhone(mockContacts, '5559999999');
    expect(contact).toBeNull();
  });

  it('should return null for null/undefined phone', () => {
    expect(findContactByPhone(mockContacts, null)).toBeNull();
    expect(findContactByPhone(mockContacts, undefined)).toBeNull();
  });

  it('should return null for empty phone', () => {
    expect(findContactByPhone(mockContacts, '')).toBeNull();
  });

  it('should find international contact', () => {
    const contact = findContactByPhone(mockContacts, '+44 20 1234 5678');
    expect(contact).not.toBeNull();
    expect(contact?.firstName).toBe('Bob');
  });

  it('should handle empty contacts array', () => {
    const contact = findContactByPhone([], '5551234567');
    expect(contact).toBeNull();
  });
});

describe('getContactDisplayName', () => {
  it('should return full name with first and last', () => {
    const contact: Contact = {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    expect(getContactDisplayName(contact)).toBe('John Doe');
  });

  it('should include middle name when present', () => {
    const contact: Contact = {
      id: '1',
      firstName: 'John',
      middleName: 'Q',
      lastName: 'Doe',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    expect(getContactDisplayName(contact)).toBe('John Q Doe');
  });

  it('should handle first name only', () => {
    const contact: Contact = {
      id: '1',
      firstName: 'John',
      lastName: '',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    expect(getContactDisplayName(contact)).toBe('John');
  });

  it('should fallback to phone number when no name', () => {
    const contact: Contact = {
      id: '1',
      firstName: '',
      lastName: '',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    expect(getContactDisplayName(contact)).toBe('5551234567');
  });

  it('should return "Unknown" when no name and no phone', () => {
    const contact: Contact = {
      id: '1',
      firstName: '',
      lastName: '',
      phoneNumber: '',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    expect(getContactDisplayName(contact)).toBe('Unknown');
  });

  it('should return empty string for null contact', () => {
    expect(getContactDisplayName(null)).toBe('');
  });

  it('should trim whitespace from full name (but not individual parts)', () => {
    const contact: Contact = {
      id: '1',
      firstName: '  John  ',
      middleName: '  Q  ',
      lastName: '  Doe  ',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact;
    // Note: Individual parts keep their internal spaces; only the final result is trimmed
    expect(getContactDisplayName(contact)).toBe('John     Q     Doe');
  });
});

describe('formatPhoneForDisplay', () => {
  it('should format 10-digit US number', () => {
    expect(formatPhoneForDisplay('5551234567')).toBe('(555) 123-4567');
    expect(formatPhoneForDisplay('2125551234')).toBe('(212) 555-1234');
  });

  it('should format 11-digit US number with leading 1', () => {
    expect(formatPhoneForDisplay('15551234567')).toBe('(555) 123-4567');
    expect(formatPhoneForDisplay('+15551234567')).toBe('(555) 123-4567');
  });

  it('should format already formatted numbers', () => {
    expect(formatPhoneForDisplay('(555) 123-4567')).toBe('(555) 123-4567');
  });

  it('should return original for international numbers', () => {
    const intl = '+442012345678';
    expect(formatPhoneForDisplay(intl)).toBe(intl);
  });

  it('should handle null/undefined', () => {
    expect(formatPhoneForDisplay(null)).toBe('');
    expect(formatPhoneForDisplay(undefined)).toBe('');
  });

  it('should return original for empty string', () => {
    expect(formatPhoneForDisplay('')).toBe('');
  });

  it('should handle short numbers', () => {
    const short = '123';
    expect(formatPhoneForDisplay(short)).toBe(short);
  });
});

describe('buildPhoneContactMap', () => {
  it('should build map with normalized phone keys', () => {
    const contacts: Contact[] = [
      {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '5551234567',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
      {
        id: '2',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '(555) 987-6543',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
    ];

    const map = buildPhoneContactMap(contacts);

    expect(map['+15551234567']).toBeDefined();
    expect(map['+15551234567'].firstName).toBe('John');
    expect(map['+15559876543']).toBeDefined();
    expect(map['+15559876543'].firstName).toBe('Jane');
  });

  it('should handle empty contacts array', () => {
    const map = buildPhoneContactMap([]);
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('should skip contacts with invalid phone numbers', () => {
    const contacts: Contact[] = [
      {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
      {
        id: '2',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '5551234567',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
    ];

    const map = buildPhoneContactMap(contacts);

    expect(Object.keys(map)).toHaveLength(1);
    expect(map['+15551234567']).toBeDefined();
  });

  it('should handle duplicate phone numbers (last one wins)', () => {
    const contacts: Contact[] = [
      {
        id: '1',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '5551234567',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
      {
        id: '2',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '(555) 123-4567', // Same normalized number
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
    ];

    const map = buildPhoneContactMap(contacts);

    expect(Object.keys(map)).toHaveLength(1);
    expect(map['+15551234567'].firstName).toBe('Jane'); // Last one wins
  });

  it('should resolve collisions from different formats using last-write-wins', () => {
    const contacts: Contact[] = [
      {
        id: '1',
        firstName: 'Old',
        lastName: 'Format',
        phoneNumber: '+1 (555) 123-4567',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
      {
        id: '2',
        firstName: 'New',
        lastName: 'Format',
        phoneNumber: '555.123.4567',
        accessLevel: 'friend',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      } as Contact,
    ];

    const map = buildPhoneContactMap(contacts);

    expect(Object.keys(map)).toHaveLength(1);
    expect(map['+15551234567'].firstName).toBe('New');
    expect(map['+15551234567'].lastName).toBe('Format');
  });
});

describe('resolveContactName', () => {
  const contactMap = buildPhoneContactMap([
    {
      id: '1',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '5551234567',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact,
    {
      id: '2',
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '5559876543',
      accessLevel: 'friend',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    } as Contact,
  ]);

  it('should resolve name from contact map', () => {
    expect(resolveContactName('5551234567', contactMap)).toBe('John Doe');
    expect(resolveContactName('(555) 123-4567', contactMap)).toBe('John Doe');
  });

  it('should format phone when contact not found', () => {
    expect(resolveContactName('5551111111', contactMap)).toBe('(555) 111-1111');
  });

  it('should use fallback when contact not found and fallback provided', () => {
    expect(resolveContactName('5551111111', contactMap, 'Anonymous')).toBe('Anonymous');
  });

  it('should return "Unknown" for null phone without fallback', () => {
    expect(resolveContactName(null, contactMap)).toBe('Unknown');
    expect(resolveContactName(undefined, contactMap)).toBe('Unknown');
  });

  it('should use fallback for null phone when provided', () => {
    expect(resolveContactName(null, contactMap, 'No Contact')).toBe('No Contact');
  });

  it('should handle different phone formats for same contact', () => {
    expect(resolveContactName('555-987-6543', contactMap)).toBe('Jane Smith');
    expect(resolveContactName('+15559876543', contactMap)).toBe('Jane Smith');
  });

  it('should work with empty contact map', () => {
    const emptyMap = buildPhoneContactMap([]);
    expect(resolveContactName('5551234567', emptyMap)).toBe('(555) 123-4567');
    expect(resolveContactName('5551234567', emptyMap, 'Unknown')).toBe('Unknown');
  });
});
