# Testing Guide for ZEKE AI Companion

> **Last Updated:** 2026-01-01
> **Status:** Initial test infrastructure implemented

---

## Overview

This document describes the testing strategy, infrastructure, and current test coverage for the ZEKE AI Companion codebase.

## Test Infrastructure

### Framework & Tools

- **Test Runner:** Jest 30.2.0
- **TypeScript Support:** ts-jest 29.4.6
- **React Native Testing:** @testing-library/react-native 13.3.3
- **API Testing:** supertest 7.1.4
- **Mocking:** jest-mock-extended 4.0.0

### Configuration Files

- `jest.config.js` - Main Jest configuration
- `jest.setup.js` - Test environment setup and global mocks
- `tsconfig.json` - Updated to include Jest types

### Directory Structure

**Existing test suites**

```
client/__tests__/
└── lib/              # Utility function tests
    └── phone-utils.test.ts
```

**Planned test suites (not yet created)**

```
client/__tests__/
├── components/       # Component tests
├── hooks/            # Custom hook tests
├── context/          # Context provider tests
└── screens/          # Screen component tests

server/__tests__/
├── routes/           # API route tests
├── middleware/       # Middleware tests
├── services/         # Service layer tests
└── security/         # Security & auth tests

shared/__tests__/
└── schema/           # Database schema & validation tests
```

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only client tests
npm run test:client

# Run only server tests
npm run test:server

# Run only security/auth tests
npm run test:security

# Run tests for CI/CD
npm run test:ci
```

### Running Specific Tests

```bash
# Run a specific test file
npm test -- phone-utils.test.ts

# Run tests matching a pattern
npm test -- --testPathPattern=auth

# Run tests with verbose output
npm test -- --verbose
```

---

## Current Test Coverage

### ✅ Completed Tests

#### Client - Utilities (client/__tests__/lib)

- `phone-utils.test.ts` exercising phone number normalization, comparison, contact lookup, and display helpers.

*No other client, server, or shared test suites exist yet; see the planned sections below for upcoming coverage areas.*

---

### ⏳ Planned Tests (Priority Order)

#### TIER 1: Critical Security & Authentication (MUST TEST FIRST)

**Server - Security**
- [ ] `server/auth-middleware.ts` - Rate limiting, lockout logic
- [ ] `server/device-auth.ts` - Token validation, device registration
- [ ] `server/zeke-security.ts` - HMAC signing/verification
- [ ] `server/sms-pairing.ts` - SMS code generation/validation

**Client - Authentication**
- [ ] `client/context/AuthContext.tsx` - Auth state management
- [ ] `client/lib/api-client.ts` - HTTP error handling, token injection

**Estimated Time:** 1-2 weeks
**Target Coverage:** 80%+

#### TIER 2: Critical API Routes & Integration (HIGH PRIORITY)

**Server - Routes**
- [ ] `server/routes.ts` - Core API endpoints
- [ ] `server/zeke-proxy.ts` - Proxy routing and forwarding
- [ ] `server/websocket.ts` - WebSocket connections

**Estimated Time:** 2 weeks
**Target Coverage:** 70%+

#### TIER 3: Business Logic & Services (SHOULD TEST)

**Server - Services**
- [ ] `server/services/limitless-api.ts`
- [ ] `server/services/voice-enrollment.ts`
- [ ] `server/services/vad-service.ts`
- [ ] Other services (8 files total)

**Client - Hooks**
- [ ] `client/hooks/useLocalLists.ts`
- [ ] `client/hooks/useSync.ts`
- [ ] `client/hooks/useUploadQueue.ts`
- [ ] Other hooks (12 files total)

**Shared - Schema**
- [ ] `shared/schema.ts` - Zod validation schemas

**Estimated Time:** 2-3 weeks
**Target Coverage:** 60%+

#### TIER 4: UI Components & Screens (NICE TO HAVE)

**Client - Components**
- [ ] 36 reusable components (Button, Card, etc.)
- [ ] 30 screen components

**Estimated Time:** Ongoing
**Target Coverage:** 50%+

---

## Writing Tests

### Test File Naming Convention

```
<filename>.test.ts     # For TypeScript files
<filename>.test.tsx    # For React components
```

### Example: Unit Test (Utilities)

```typescript
// client/__tests__/lib/example-utils.test.ts
import { someFunction } from '@/lib/example-utils';

describe('someFunction', () => {
  it('should handle valid input', () => {
    expect(someFunction('valid')).toBe('expected');
  });

  it('should handle null/undefined', () => {
    expect(someFunction(null)).toBe('');
    expect(someFunction(undefined)).toBe('');
  });

  it('should throw on invalid input', () => {
    expect(() => someFunction('invalid')).toThrow('Error message');
  });
});
```

### Example: Component Test

```typescript
// client/__tests__/components/Button.test.tsx
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '@/components/Button';

describe('Button', () => {
  it('should render with text', () => {
    const { getByText } = render(<Button>Click Me</Button>);
    expect(getByText('Click Me')).toBeDefined();
  });

  it('should call onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress}>Click Me</Button>
    );

    fireEvent.press(getByText('Click Me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when disabled prop is true', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button onPress={onPress} disabled>Click Me</Button>
    );

    fireEvent.press(getByText('Click Me'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
```

### Example: API Route Test

```typescript
// server/__tests__/routes/example-routes.test.ts
import request from 'supertest';
import { app } from '../../index';

describe('GET /api/example', () => {
  it('should return 401 without auth token', async () => {
    const response = await request(app).get('/api/example');
    expect(response.status).toBe(401);
  });

  it('should return data with valid token', async () => {
    const response = await request(app)
      .get('/api/example')
      .set('x-zeke-device-token', 'valid-token');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('data');
  });

  it('should handle errors gracefully', async () => {
    // Mock database failure
    const response = await request(app)
      .get('/api/example')
      .set('x-zeke-device-token', 'valid-token');

    expect(response.status).toBe(500);
    expect(response.body.error).toBeDefined();
  });
});
```

---

## Best Practices

### Test Organization

1. **Group related tests** - Use `describe` blocks for logical grouping
2. **Clear test names** - Use "should" statements describing expected behavior
3. **Arrange-Act-Assert** - Structure tests with setup, execution, assertion
4. **One assertion per test** - Keep tests focused (with exceptions for related checks)

### Mocking

```typescript
// Mock external dependencies
jest.mock('@/lib/api-client');

// Mock implementation
const mockApiClient = jest.mocked(apiClient);
mockApiClient.get.mockResolvedValue({ data: 'test' });

// Verify mock calls
expect(mockApiClient.get).toHaveBeenCalledWith('/api/endpoint');
```

### Testing Edge Cases

Always test:
- ✅ Happy path (valid inputs, expected outputs)
- ✅ Null/undefined inputs
- ✅ Empty strings/arrays/objects
- ✅ Invalid formats
- ✅ Error conditions
- ✅ Boundary values

### Coverage Goals

- **Critical code (security, auth):** 80%+ coverage
- **Business logic:** 70%+ coverage
- **UI components:** 50%+ coverage
- **Overall project:** 60%+ coverage (initial goal)

---

## CI/CD Integration

### GitHub Actions (Planned)

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
```

---

## Troubleshooting

### Common Issues

**Issue:** TypeScript errors about Jest globals (describe, it, expect)
**Solution:** Ensure `tsconfig.json` includes `"types": ["node", "jest"]`

**Issue:** Module path alias not resolving
**Solution:** Check `moduleNameMapper` in `jest.config.js` matches `tsconfig.json` paths

**Issue:** React Native component tests failing
**Solution:** Ensure `preset: 'react-native'` is set in `jest.config.js`

**Issue:** Tests timing out
**Solution:** Increase timeout with `jest.setTimeout(10000)` or use `--testTimeout` flag

---

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Supertest Documentation](https://github.com/ladjs/supertest)
- [CLAUDE.md](./CLAUDE.md) - AI assistant guide (includes testing guidelines)

---

## Contributing

When adding new features:

1. **Write tests first** (TDD approach recommended for critical code)
2. **Ensure tests pass** - Run `npm test` before committing
3. **Maintain coverage** - Don't decrease overall coverage percentage
4. **Update this document** - Document new test patterns/utilities

---

## Test Coverage Report

Last generated: 2026-01-01

```
File                          | % Stmts | % Branch | % Funcs | % Lines
------------------------------|---------|----------|---------|--------
client/lib/phone-utils.ts     |   100.0 |    100.0 |   100.0 |   100.0
------------------------------|---------|----------|---------|--------
Total (1 file tested so far)  |   100.0 |    100.0 |   100.0 |   100.0
```

**Overall Project Coverage:** <1% (baseline established, rapid growth expected)

---

## Changelog

| Date | Change | Coverage |
|------|--------|----------|
| 2026-01-01 | Initial test infrastructure setup | 0% → <1% |
| 2026-01-01 | Added phone-utils.ts tests (49 tests) | <1% |

---

**Next Steps:**
1. Implement Tier 1 security tests (auth-middleware, device-auth, zeke-security)
2. Add SMS pairing flow tests
3. Set up API route integration tests
4. Configure CI/CD pipeline with automated testing
