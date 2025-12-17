import { describe, it, expect } from 'vitest';
import { redact, redactObject, createRedactor } from '../../lib/pii';

describe('PII Redactor', () => {
  describe('email redaction', () => {
    it('should redact email addresses', () => {
      const text = 'Contact me at john.doe@example.com for more info';
      const result = redact(text);
      
      expect(result).toBe('Contact me at [EMAIL] for more info');
      expect(result).not.toContain('john.doe@example.com');
    });

    it('should redact multiple emails', () => {
      const text = 'Send to alice@test.org and bob@company.co.uk';
      const result = redact(text);
      
      expect(result).toBe('Send to [EMAIL] and [EMAIL]');
    });

    it('should preserve length when configured', () => {
      const text = 'Email: test@example.com';
      const result = redact(text, { preserveLength: true });
      
      expect(result).toContain('@');
      expect(result).not.toContain('test@example.com');
      expect(result).toMatch(/t\*+@\*+\.com/);
    });
  });

  describe('phone redaction', () => {
    it('should redact US phone numbers', () => {
      const text = 'Call me at 555-123-4567';
      const result = redact(text);
      
      expect(result).toBe('Call me at [PHONE]');
    });

    it('should redact phone with area code in parens', () => {
      const text = 'Phone: (555) 123-4567';
      const result = redact(text);
      
      expect(result).toBe('Phone: [PHONE]');
    });

    it('should redact phone with +1 prefix', () => {
      const text = 'Call +1-555-123-4567';
      const result = redact(text);
      
      expect(result).toBe('Call [PHONE]');
    });

    it('should preserve length when configured', () => {
      const text = 'Phone: 555-123-4567';
      const result = redact(text, { preserveLength: true });
      
      expect(result).toBe('Phone: ***-***-****');
    });
  });

  describe('SSN redaction', () => {
    it('should redact SSN with dashes', () => {
      const text = 'SSN: 123-45-6789';
      const result = redact(text);
      
      expect(result).toBe('SSN: [SSN]');
    });

    it('should redact SSN without dashes', () => {
      const text = 'SSN is 123456789';
      const result = redact(text);
      
      expect(result).toBe('SSN is [SSN]');
    });
  });

  describe('credit card redaction', () => {
    it('should redact credit card numbers', () => {
      const text = 'Card: 4111-1111-1111-1111';
      const result = redact(text);
      
      expect(result).toBe('Card: [CC]');
    });

    it('should redact credit card without dashes', () => {
      const text = 'Card 4111111111111111';
      const result = redact(text);
      
      expect(result).toBe('Card [CC]');
    });
  });

  describe('address redaction', () => {
    it('should redact street addresses', () => {
      const text = 'Located at 123 Main Street';
      const result = redact(text);
      
      expect(result).toBe('Located at [ADDRESS]');
    });

    it('should redact addresses with apt numbers', () => {
      const text = 'Address: 456 Oak Ave, Apt 12';
      const result = redact(text);
      
      expect(result).toBe('Address: [ADDRESS]');
    });

    it('should handle various street types', () => {
      expect(redact('100 First Blvd')).toBe('[ADDRESS]');
      expect(redact('200 Second Road')).toBe('[ADDRESS]');
      expect(redact('300 Third Dr')).toBe('[ADDRESS]');
    });
  });

  describe('IP address redaction', () => {
    it('should redact IP addresses', () => {
      const text = 'Server at 192.168.1.100';
      const result = redact(text);
      
      expect(result).toBe('Server at [IP]');
    });

    it('should preserve localhost IPs', () => {
      const text = 'Bind to 127.0.0.1 and 0.0.0.0';
      const result = redact(text);
      
      expect(result).toBe('Bind to 127.0.0.1 and 0.0.0.0');
    });
  });

  describe('selective redaction', () => {
    it('should only redact specified types', () => {
      const text = 'Email: test@example.com, Phone: 555-123-4567';
      const result = redact(text, { redactEmails: true, redactPhones: false });
      
      expect(result).toBe('Email: [EMAIL], Phone: 555-123-4567');
    });

    it('should respect all disabled flags', () => {
      const text = 'test@example.com 555-123-4567';
      const result = redact(text, {
        redactEmails: false,
        redactPhones: false,
        redactSSN: false,
        redactCreditCards: false,
        redactAddresses: false,
        redactIPs: false,
      });
      
      expect(result).toBe(text);
    });
  });

  describe('redactObject', () => {
    it('should redact strings in objects', () => {
      const obj = {
        name: 'John',
        email: 'john@example.com',
        phone: '555-123-4567',
      };
      
      const result = redactObject(obj);
      
      expect(result.name).toBe('John');
      expect(result.email).toBe('[EMAIL]');
      expect(result.phone).toBe('[PHONE]');
    });

    it('should redact nested objects', () => {
      const obj = {
        user: {
          contact: {
            email: 'test@test.com',
          },
        },
      };
      
      const result = redactObject(obj);
      
      expect(result.user.contact.email).toBe('[EMAIL]');
    });

    it('should redact arrays', () => {
      const arr = ['alice@test.com', 'bob@test.com'];
      const result = redactObject(arr);
      
      expect(result).toEqual(['[EMAIL]', '[EMAIL]']);
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it('should preserve non-string values', () => {
      const obj = { count: 42, active: true };
      const result = redactObject(obj);
      
      expect(result).toEqual({ count: 42, active: true });
    });
  });

  describe('createRedactor', () => {
    it('should create a configured redactor', () => {
      const redactor = createRedactor({ preserveLength: true });
      
      const result = redactor.redact('Call 555-123-4567');
      expect(result).toBe('Call ***-***-****');
    });

    it('should apply config to object redaction', () => {
      const redactor = createRedactor({ redactEmails: false });
      
      const result = redactor.redactObject({ email: 'test@test.com' });
      expect(result.email).toBe('test@test.com');
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      expect(redact('')).toBe('');
    });

    it('should handle strings with no PII', () => {
      const text = 'Just a normal message with no sensitive data';
      expect(redact(text)).toBe(text);
    });

    it('should handle mixed PII types', () => {
      const text = 'User john@test.com called from 555-123-4567 at 192.168.1.1';
      const result = redact(text);
      
      expect(result).toBe('User [EMAIL] called from [PHONE] at [IP]');
    });
  });
});
