"""
Comprehensive PII redaction for logs and tickets.

Masks:
- Email addresses
- Phone numbers
- Social Security Numbers (SSN)
- Credit card numbers
- Street addresses
- IP addresses (except localhost)
"""

import re
from dataclasses import dataclass
from typing import Any


EMAIL_PATTERN = re.compile(
    r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
)

PHONE_PATTERN = re.compile(
    r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
)

SSN_PATTERN = re.compile(
    r'\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b'
)

CREDIT_CARD_PATTERN = re.compile(
    r'\b(?:\d{4}[-.\s]?){3}\d{4}\b'
)

ADDRESS_PATTERN = re.compile(
    r'\b\d{1,5}\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Circle|Cir)\b',
    re.IGNORECASE
)

IP_ADDRESS_PATTERN = re.compile(
    r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
)

LOCALHOST_IPS = frozenset({"127.0.0.1", "0.0.0.0"})


@dataclass
class RedactorConfig:
    """Configuration for PII redaction."""
    mask_char: str = "*"
    preserve_length: bool = False
    redact_emails: bool = True
    redact_phones: bool = True
    redact_ssn: bool = True
    redact_credit_cards: bool = True
    redact_addresses: bool = True
    redact_ips: bool = True


def _mask_email(email: str, mask_char: str, preserve_length: bool) -> str:
    """Mask an email address."""
    if preserve_length:
        at_idx = email.find("@")
        if at_idx > 0:
            local = email[:at_idx]
            domain = email[at_idx + 1:]
            masked_local = local[0] + mask_char * (len(local) - 1)
            dot_idx = domain.rfind(".")
            if dot_idx > 0:
                domain_name = mask_char * dot_idx
                tld = domain[dot_idx:]
                return f"{masked_local}@{domain_name}{tld}"
            return f"{masked_local}@{mask_char * len(domain)}"
    return "[EMAIL]"


def _mask_phone(phone: str, mask_char: str, preserve_length: bool) -> str:
    """Mask a phone number."""
    if preserve_length:
        return re.sub(r'\d', mask_char, phone)
    return "[PHONE]"


def _mask_generic(value: str, mask_char: str, preserve_length: bool, label: str) -> str:
    """Generic masking for SSN, CC, addresses, IPs."""
    if preserve_length:
        return mask_char * len(value)
    return f"[{label}]"


def redact(text: str, config: RedactorConfig | None = None) -> str:
    """
    Redact PII from a string.
    
    Args:
        text: The string to redact
        config: Optional redaction configuration
        
    Returns:
        String with PII masked
    """
    if not isinstance(text, str):
        return text
    
    cfg = config or RedactorConfig()
    result = text
    
    if cfg.redact_emails:
        result = EMAIL_PATTERN.sub(
            lambda m: _mask_email(m.group(), cfg.mask_char, cfg.preserve_length),
            result
        )
    
    if cfg.redact_credit_cards:
        result = CREDIT_CARD_PATTERN.sub(
            lambda m: _mask_generic(m.group(), cfg.mask_char, cfg.preserve_length, "CC"),
            result
        )
    
    if cfg.redact_ssn:
        result = SSN_PATTERN.sub(
            lambda m: _mask_generic(m.group(), cfg.mask_char, cfg.preserve_length, "SSN"),
            result
        )
    
    if cfg.redact_phones:
        result = PHONE_PATTERN.sub(
            lambda m: _mask_phone(m.group(), cfg.mask_char, cfg.preserve_length),
            result
        )
    
    if cfg.redact_addresses:
        result = ADDRESS_PATTERN.sub(
            lambda m: _mask_generic(m.group(), cfg.mask_char, cfg.preserve_length, "ADDRESS"),
            result
        )
    
    if cfg.redact_ips:
        def mask_ip(match: re.Match) -> str:
            ip = match.group()
            if ip in LOCALHOST_IPS:
                return ip
            return _mask_generic(ip, cfg.mask_char, cfg.preserve_length, "IP")
        result = IP_ADDRESS_PATTERN.sub(mask_ip, result)
    
    return result


def redact_object(obj: Any, config: RedactorConfig | None = None) -> Any:
    """
    Recursively redact PII from any JSON-serializable object.
    
    Args:
        obj: Any JSON-serializable value (str, dict, list, etc.)
        config: Optional redaction configuration
        
    Returns:
        Object with all PII masked
    """
    if obj is None:
        return obj
    
    if isinstance(obj, str):
        return redact(obj, config)
    
    if isinstance(obj, dict):
        return {k: redact_object(v, config) for k, v in obj.items()}
    
    if isinstance(obj, (list, tuple)):
        return type(obj)(redact_object(item, config) for item in obj)
    
    return obj


class PIIRedactor:
    """
    Stateful PII redactor with configurable settings.
    
    Example:
        redactor = PIIRedactor(preserve_length=True)
        clean_data = redactor.redact_all(sensitive_data)
    """
    
    def __init__(self, **config_kwargs):
        """Initialize with optional config overrides."""
        self.config = RedactorConfig(**config_kwargs)
    
    def redact_string(self, text: str) -> str:
        """Redact PII from a string."""
        return redact(text, self.config)
    
    def redact_all(self, obj: Any) -> Any:
        """Redact PII from any object recursively."""
        return redact_object(obj, self.config)
