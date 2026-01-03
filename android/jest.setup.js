// Jest setup file
// This file runs before each test suite

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.OPENAI_API_KEY = 'sk-test-key';
process.env.TWILIO_ACCOUNT_SID = 'AC-test-sid';
process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
process.env.EXPO_PUBLIC_ZEKE_BACKEND_URL = 'http://localhost:3000';
process.env.ZEKE_SHARED_SECRET = 'test-secret-key';
process.env.ZEKE_PROXY_ID = 'test-proxy-id';

// Mock console methods to reduce noise in tests (optional)
global.console = {
  ...console,
  // Uncomment to suppress logs during tests:
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  error: jest.fn(), // Keep errors visible
};

// Mock timers helpers
global.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
