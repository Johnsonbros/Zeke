/**
 * Wearable Device Developer Reference
 * Critical technical specifications for Limitless Pendant and Omi integration
 */

/* ============================================================================
   LIMITLESS PENDANT - DEVELOPER REFERENCE
   ============================================================================ */

export const LIMITLESS_PENDANT_SPECS = {
  // API Configuration
  api: {
    baseUrl: "https://api.limitless.ai/v1",
    authHeader: "X-API-Key",
    rateLimit: {
      requestsPerMinute: 180,
      errorCode: 429,
      errorMessage: "API key is rate limited",
    },
    status: "Beta - Pendant data only (not web/desktop meetings)",
  },

  // Hardware Specifications
  hardware: {
    dimensions: {
      width: "31.9mm (1.25 inches)",
      thickness: "16mm (0.62 inches)",
    },
    material: "Aluminum body with dual-disc construction",
    weight: "Lightweight",
    colors: [
      "black",
      "blue",
      "green",
      "grey",
      "navy blue",
      "pink",
      "white",
      "yellow",
    ],
    waterResistance: {
      rating: "IP54",
      description: "Splash/dust resistant, NOT waterproof",
      comparison: "Same as AirPods Pro 2",
    },
    operatingConditions: {
      temperature: "32°–113°F (0°–45°C)",
      humidity: "0–95% (non-condensing)",
    },
  },

  // Battery & Power
  battery: {
    batteryLife: "100 hours continuous recording (theoretical)",
    realWorldUsage: "6–7 hours in typical use",
    charging: {
      port: "USB-C",
      includedCable: "Braided USB-C",
      chargerCompatibility:
        "Standard USB chargers only - DO NOT USE Power Delivery (PD) chargers - can damage device",
    },
    protection: "Over-discharge protection circuit prevents harmful levels",
    recommendation: "Charge nightly for optimal long-term battery health",
  },

  // Audio Specifications
  audio: {
    microphones: "Multiple high-quality mics with beam-forming technology",
    audioQuality: "Clear recording even in noisy environments",
    storage: {
      onDevice: "35 hours continuous speech (voice-activated only)",
      cloud: "Unlimited with all plans",
      autoOffload: "Syncs to phone via Bluetooth when in range",
    },
    limitations: {
      headphoneAudio: "Cannot capture from AirPods or Bluetooth headphones",
      phoneCallRecording: "Must use speakerphone mode",
      oweMicrophone: "Records through its own mic only",
    },
  },

  // Connectivity
  connectivity: {
    wireless: ["Wi-Fi", "Bluetooth"],
    pairing: "Via iOS/Android app ONLY (not standard Bluetooth settings)",
    deviceLimit: "One pendant per account",
  },

  // App Requirements
  appRequirements: {
    ios: {
      minimum: "iOS 18+",
      supported: ["iPhone", "iPad (iPadOS 18+)"],
      syncRecommendation: "At least once daily for iPad users",
    },
    android: {
      minimum: "Android 13+",
      supported: ["Android phones"],
    },
    desktopSupport: "Mac, Windows, Web app (view/search only)",
  },

  // API Endpoints (Critical)
  apiEndpoints: {
    lifelogs: {
      get: "GET /lifelogs",
      description: "Retrieve pendant recordings",
      queryParams: {
        date: 'ISO date (e.g., "2025-07-20")',
        timezone: 'IANA timezone (e.g., "America/Los_Angeles")',
        search: "Search query string",
      },
      responseExample: {
        lifelogs: [
          {
            id: "string",
            date: "ISO date",
            transcription: "string",
            summary: "string",
            actionItems: ["string"],
          },
        ],
      },
    },
    lifelogById: {
      get: "GET /lifelogs/{id}",
      description: "Get specific lifelog by ID",
    },
    deleteLifelog: {
      delete: "DELETE /lifelogs/{id}",
      description: "Delete a lifelog recording",
    },
    downloadAudio: {
      get: "GET /download-audio",
      description: "Download raw audio in Ogg Opus format",
      queryParams: {
        startMs: "Milliseconds timestamp",
        endMs: "Milliseconds timestamp",
      },
      limits: {
        maxDuration: "2 hours (7,200,000 ms) per request",
        format: "Ogg Opus (binary)",
      },
    },
  },

  // Pricing & Subscription (for reference)
  pricing: {
    device: "$99",
    plans: {
      free: {
        transcriptionPerMonth: "1,200 minutes (20 hours)",
        aiFeatures: "Unlimited",
        audioStorage: "Unlimited",
      },
      pro: {
        cost: "$19/month",
        transcriptionPerMonth: "Unlimited",
        aiFeatures: "Unlimited",
      },
    },
  },

  // Critical Limitations
  limitations: [
    "API currently supports Pendant data only (not web/desktop meetings)",
    "Only ONE Pendant can be paired per account",
    "Cannot record from headphones/AirPods - internal mic only",
    "Phone calls require speakerphone mode",
    "Cannot dim or turn off LED light (privacy reason)",
    "Not waterproof (IP54 only) - avoid submersion",
  ],

  // Support & Resources
  support: {
    developerPortal: "https://www.limitless.ai/developers",
    apiDocs: "https://help.limitless.ai/en/articles/11106060-limitless-api",
    slack: "#developers channel at https://limitless.ai/community",
    email: "support@limitless.ai",
  },
};

/* ============================================================================
   OMI WEARABLE - DEVELOPER REFERENCE
   ============================================================================ */

export const OMI_WEARABLE_SPECS = {
  // Hardware Specifications
  hardware: {
    formFactor: "Circular orb ~25mm diameter (silver dollar size)",
    material: "Lightweight aluminum with 3D-printed housing",
    wearingOptions: [
      "Necklace",
      "Clip to clothing",
      "Medical tape to forehead/temple",
    ],
    storage: "64GB internal storage",
  },

  // Battery & Power
  battery: {
    type: "Rechargeable USB-C",
    batteryLife: "Up to 3 days on single charge",
    chargingPort: "USB-C",
  },

  // Connectivity
  connectivity: {
    wireless: "Bluetooth Low Energy (BLE)",
    pairing: "Via iOS/Android app",
    supportedPlatforms: ["iOS", "Android"],
    protocol: "Custom BLE implementation",
  },

  // Audio & Microphone
  audio: {
    microphone: "Built-in with human-level accuracy",
    speaker: "None - responses via app",
    capability: "Continuous listening",
  },

  // Backend Stack (for reference if building integrations)
  backendTech: {
    languages: ["Python"],
    framework: "FastAPI",
    database: "Firebase",
    vectorDb: "Pinecone",
    cache: "Redis",
    transcription: ["Deepgram", "Speechmatic", "Soniox"],
    aiServices: ["OpenAI (GPT-4o)", "OpenAI-compatible APIs"],
    orchestration: "LangChain",
    voiceActivityDetection: "Silero VAD",
  },

  // API & Integration
  api: {
    documentation: "https://docs.omi.me/",
    github: "https://github.com/BasedHardware/omi",
    apiSpec: "https://omi01.docs.apiary.io/",
    integrationGuide: "https://docs.omi.me/doc/integrations",
    webhooks: "Real-time transcription via webhooks",
    dataStorage: "Local or cloud options",
  },

  // Developer Capabilities
  developerFeatures: {
    openSource: "Fully open-source platform",
    appDevelopment: "Build apps in ~1 minute",
    integrations: [
      "Google Calendar",
      "Notion",
      "Google Drive",
      "Custom webhooks",
    ],
    marketplace: "250+ apps available",
    dataAccess: "Full control - remote deletion/access via app",
  },

  // Pricing & Availability
  pricing: {
    consumer: {
      price: "$89",
      availability: "Q2 2025",
    },
    developer: {
      price: "$70",
      availability: "Currently available",
      bonus: "First 5,000 orders get priority brain-interface module",
    },
  },

  // Privacy & Security
  security: {
    codebase: "Open-source (users can audit data flow)",
    encryption: "End-to-end encryption available",
    dataControl: "One-click data deletion",
    microphoneMode:
      "Configurable to hear all voices or only user's voice",
    remoteAccess: "Full data access/deletion via app if device lost",
  },

  // Development Resources
  community: {
    discord: "Active developer Discord",
    bounties: "Paid bounties available ($100K+ pool)",
    github: "https://github.com/BasedHardware/omi",
    contributions: "Open for community contributions",
  },

  // Critical Integration Points
  integrationPoints: [
    "Capture & analyze BLE traffic to decode device protocol",
    "Manage connection via mobile app code",
    "Handle real-time data processing and streaming",
    "Receive transcripts via webhooks or polling",
    "Process via AI models (GPT-4o or custom)",
    "Store locally or in cloud",
  ],
};

/* ============================================================================
   COMPARISON & DEVICE CAPABILITIES
   ============================================================================ */

export const WEARABLE_COMPARISON = {
  limitlessPendant: {
    name: "Limitless Pendant",
    form: "Pendant/necklace",
    batteryLife: "100 hours (6-7 hours real-world)",
    storage: "35 hours local, unlimited cloud",
    connectivity: "Wi-Fi + Bluetooth",
    apiAccess: "Lifelogs via REST API",
    dataOwnership: "Full control via API",
    useCase: "Day-long memory capture without device pairing",
  },
  omi: {
    name: "Omi",
    form: "Small orb (~25mm)",
    batteryLife: "Up to 3 days",
    storage: "64GB internal",
    connectivity: "Bluetooth Low Energy",
    apiAccess: "Webhooks + REST",
    dataOwnership: "Full control, open-source",
    useCase: "Developer-friendly AI wearable with extensibility",
  },
};

/* ============================================================================
   INTEGRATION PATTERNS FOR ZEKE APP
   ============================================================================ */

export const ZEKE_INTEGRATION_PATTERNS = {
  limitlessSync: {
    description: "Sync Limitless Pendant lifelogs to ZEKE memories",
    requirements: [
      "User Limitless API key",
      "Regular polling of /v1/lifelogs endpoint",
      "Cache invalidation on new imports",
    ],
    rateLimit:
      "180 requests/minute - batch requests to avoid throttling",
    caching:
      "Consider 5-10 minute cache for frequently accessed data",
  },

  omiIntegration: {
    description:
      "Direct BLE integration with Omi for real-time transcription",
    requirements: [
      "BLE protocol implementation (mobile-specific)",
      "Webhook handler for real-time transcripts",
      "Local processing capabilities",
    ],
    platforms:
      "iOS/Android only - requires development build (not Expo Go)",
  },

  memoryCapture: {
    description:
      "Convert wearable data to ZEKE memory entries with timestamps",
    dataMapping: {
      lifelogId: "unique memory ID",
      transcription: "memory content",
      summary: "memory summary",
      actionItems: "extractable tasks",
      date: "timestamp",
    },
  },
};
