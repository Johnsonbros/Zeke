/**
 * PII Redactor
 * 
 * Masks sensitive personal information (emails, phone numbers, addresses)
 * in logs and diagnostic tickets.
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;

const SSN_REGEX = /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g;

const CREDIT_CARD_REGEX = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

const ADDRESS_REGEX = /\b\d{1,5}\s+(?:[A-Za-z]+\s+){1,4}(?:St(?:reet)?|Ave(?:nue)?|Blvd|Boulevard|Rd|Road|Dr(?:ive)?|Ln|Lane|Way|Ct|Court|Pl|Place|Cir(?:cle)?|Hwy|Highway)\b\.?(?:\s*,?\s*(?:Apt|Suite|Unit|#)\s*\d+)?/gi;

const IP_ADDRESS_REGEX = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;

export interface RedactorConfig {
  maskChar?: string;
  preserveLength?: boolean;
  redactEmails?: boolean;
  redactPhones?: boolean;
  redactSSN?: boolean;
  redactCreditCards?: boolean;
  redactAddresses?: boolean;
  redactIPs?: boolean;
}

const DEFAULT_CONFIG: Required<RedactorConfig> = {
  maskChar: '*',
  preserveLength: false,
  redactEmails: true,
  redactPhones: true,
  redactSSN: true,
  redactCreditCards: true,
  redactAddresses: true,
  redactIPs: true,
};

function createMask(original: string, maskChar: string, preserveLength: boolean, label: string): string {
  if (preserveLength) {
    return maskChar.repeat(original.length);
  }
  return `[${label}]`;
}

function maskEmail(email: string, maskChar: string, preserveLength: boolean): string {
  if (preserveLength) {
    const [local, domain] = email.split('@');
    const maskedLocal = local[0] + maskChar.repeat(local.length - 1);
    const domainParts = domain.split('.');
    const maskedDomain = domainParts.map((part, i) => 
      i === domainParts.length - 1 ? part : maskChar.repeat(part.length)
    ).join('.');
    return `${maskedLocal}@${maskedDomain}`;
  }
  return '[EMAIL]';
}

function maskPhone(phone: string, maskChar: string, preserveLength: boolean): string {
  if (preserveLength) {
    return phone.replace(/\d/g, maskChar);
  }
  return '[PHONE]';
}

export function redact(text: string, config: RedactorConfig = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let result = text;

  if (cfg.redactEmails) {
    result = result.replace(EMAIL_REGEX, (match) => 
      maskEmail(match, cfg.maskChar, cfg.preserveLength)
    );
  }

  if (cfg.redactCreditCards) {
    result = result.replace(CREDIT_CARD_REGEX, (match) => 
      createMask(match, cfg.maskChar, cfg.preserveLength, 'CC')
    );
  }

  if (cfg.redactSSN) {
    result = result.replace(SSN_REGEX, (match) => 
      createMask(match, cfg.maskChar, cfg.preserveLength, 'SSN')
    );
  }

  if (cfg.redactPhones) {
    result = result.replace(PHONE_REGEX, (match) => 
      maskPhone(match, cfg.maskChar, cfg.preserveLength)
    );
  }

  if (cfg.redactAddresses) {
    result = result.replace(ADDRESS_REGEX, (match) => 
      createMask(match, cfg.maskChar, cfg.preserveLength, 'ADDRESS')
    );
  }

  if (cfg.redactIPs) {
    result = result.replace(IP_ADDRESS_REGEX, (match) => {
      if (match === '127.0.0.1' || match === '0.0.0.0') {
        return match;
      }
      return createMask(match, cfg.maskChar, cfg.preserveLength, 'IP');
    });
  }

  return result;
}

export function redactObject<T>(obj: T, config: RedactorConfig = {}): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redact(obj, config) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactObject(item, config)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = redactObject(value, config);
    }
    return result as T;
  }

  return obj;
}

export function createRedactor(config: RedactorConfig = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  return {
    redact: (text: string) => redact(text, cfg),
    redactObject: <T>(obj: T) => redactObject(obj, cfg),
  };
}

export const piiRedactor = createRedactor();
