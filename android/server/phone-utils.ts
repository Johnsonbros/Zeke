export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";
  
  const digitsOnly = phone.replace(/\D/g, "");
  
  if (digitsOnly.length === 0) return "";
  
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }
  
  if (digitsOnly.length > 10 && !digitsOnly.startsWith("1")) {
    return `+${digitsOnly}`;
  }
  
  return `+1${digitsOnly}`;
}

export function phonesMatch(
  phone1: string | null | undefined,
  phone2: string | null | undefined
): boolean {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  if (!normalized1 || !normalized2) return false;
  
  return normalized1 === normalized2;
}

export function formatPhoneForDisplay(phone: string | null | undefined): string {
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return phone || "";
  
  const digits = normalized.replace(/\D/g, "");
  
  if (digits.length === 11 && digits.startsWith("1")) {
    const area = digits.substring(1, 4);
    const exchange = digits.substring(4, 7);
    const subscriber = digits.substring(7, 11);
    return `(${area}) ${exchange}-${subscriber}`;
  }
  
  if (digits.length === 10) {
    const area = digits.substring(0, 3);
    const exchange = digits.substring(3, 6);
    const subscriber = digits.substring(6, 10);
    return `(${area}) ${exchange}-${subscriber}`;
  }
  
  return phone || "";
}

export interface Contact {
  id: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
}

export interface PhoneContactMap {
  [normalizedPhone: string]: Contact;
}

export function buildPhoneContactMap(contacts: Contact[]): PhoneContactMap {
  const map: PhoneContactMap = {};
  
  for (const contact of contacts) {
    const normalized = normalizePhoneNumber(contact.phoneNumber);
    if (normalized) {
      map[normalized] = contact;
    }
  }
  
  return map;
}

export function getContactDisplayName(contact: Contact | null): string {
  if (!contact) return "";
  
  const parts = [contact.firstName, contact.middleName, contact.lastName].filter(
    (p) => p && p.trim()
  );
  
  return parts.join(" ").trim() || contact.phoneNumber || "Unknown";
}

export function resolveContactName(
  phoneNumber: string | null | undefined,
  contactMap: PhoneContactMap,
  fallback?: string
): string {
  if (!phoneNumber) return fallback || "Unknown";
  
  const normalized = normalizePhoneNumber(phoneNumber);
  const contact = normalized ? contactMap[normalized] : null;
  
  if (contact) {
    return getContactDisplayName(contact);
  }
  
  return fallback || formatPhoneForDisplay(phoneNumber) || "Unknown";
}
