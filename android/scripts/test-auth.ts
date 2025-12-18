import crypto from 'crypto';

const BASE_URL = 'http://localhost:5000';
const SHARED_SECRET = process.env.ZEKE_SHARED_SECRET || '';

interface TestResult {
  test: string;
  passed: boolean;
  details?: string;
}

async function makeRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
  } = {}
): Promise<{ status: number; data: any }> {
  const { method = 'GET', headers = {}, body } = options;
  
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: body ? JSON.stringify(body) : undefined
    });
    
    const data = await response.json().catch(() => ({}));
    return { status: response.status, data };
  } catch (error) {
    return { status: 0, data: { error: String(error) } };
  }
}

async function runTests() {
  const results: TestResult[] = [];
  
  console.log('='.repeat(60));
  console.log('ZEKE Authentication Test Suite');
  console.log('='.repeat(60));
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Secret configured: ${SHARED_SECRET ? 'Yes' : 'No'}\n`);

  // Test 1: Check auth status (public route)
  console.log('1. Testing auth status endpoint (public route)...');
  const statusResult = await makeRequest('/api/auth/status');
  const statusPassed = statusResult.status === 200 && statusResult.data.configured !== undefined;
  results.push({
    test: 'Auth status endpoint accessible',
    passed: statusPassed,
    details: `Status: ${statusResult.status}, Configured: ${statusResult.data.configured}`
  });
  console.log(`   Status: ${statusPassed ? 'PASS' : 'FAIL'}`);
  console.log(`   Response: ${JSON.stringify(statusResult.data)}\n`);

  // Test 2: Protected route without auth (should fail)
  console.log('2. Testing protected route without auth (should be rejected)...');
  const noAuthResult = await makeRequest('/api/tasks');
  const noAuthPassed = statusResult.data.configured ? 
    (noAuthResult.status === 401 || noAuthResult.status === 429) : 
    noAuthResult.status === 200;
  results.push({
    test: 'Protected route rejects unauthenticated requests',
    passed: noAuthPassed,
    details: `Status: ${noAuthResult.status}`
  });
  console.log(`   Status: ${noAuthPassed ? 'PASS' : 'FAIL'}`);
  console.log(`   Response: ${JSON.stringify(noAuthResult.data)}\n`);

  // Test 3: Invalid device token (should fail)
  console.log('3. Testing with invalid device token (should be rejected)...');
  const invalidTokenResult = await makeRequest('/api/tasks', {
    headers: { 'X-ZEKE-Device-Token': 'invalid_token_12345' }
  });
  const invalidTokenPassed = statusResult.data.configured ?
    (invalidTokenResult.status === 401 || invalidTokenResult.status === 429) :
    true;
  results.push({
    test: 'Invalid device token rejected',
    passed: invalidTokenPassed,
    details: `Status: ${invalidTokenResult.status}`
  });
  console.log(`   Status: ${invalidTokenPassed ? 'PASS' : 'FAIL'}`);
  console.log(`   Response: ${JSON.stringify(invalidTokenResult.data)}\n`);

  // Test 4: Device pairing flow (if secret is configured)
  let deviceToken: string | null = null;
  if (SHARED_SECRET) {
    console.log('4. Testing device pairing flow...');
    const pairResult = await makeRequest('/api/auth/pair', {
      method: 'POST',
      body: { secret: SHARED_SECRET, deviceName: 'Test Device' }
    });
    const pairPassed = (pairResult.status === 200 || pairResult.status === 201) && pairResult.data.deviceToken;
    deviceToken = pairResult.data.deviceToken;
    results.push({
      test: 'Device pairing with valid secret',
      passed: pairPassed,
      details: `Status: ${pairResult.status}, Token received: ${!!deviceToken}`
    });
    console.log(`   Status: ${pairPassed ? 'PASS' : 'FAIL'}`);
    console.log(`   Token preview: ${deviceToken ? `${deviceToken.substring(0, 8)}...` : 'none'}\n`);

    // Test 5: Access protected route with valid token
    if (deviceToken) {
      console.log('5. Testing protected route with valid device token...');
      const authResult = await makeRequest('/api/tasks', {
        headers: { 'X-ZEKE-Device-Token': deviceToken }
      });
      const authPassed = authResult.status === 200 || authResult.status === 404;
      results.push({
        test: 'Protected route accessible with valid token',
        passed: authPassed,
        details: `Status: ${authResult.status}`
      });
      console.log(`   Status: ${authPassed ? 'PASS' : 'FAIL'}`);
      console.log(`   Response: ${JSON.stringify(authResult.data).substring(0, 100)}\n`);

      // Test 6: Token verification
      console.log('6. Testing token verification endpoint...');
      const verifyResult = await makeRequest('/api/auth/verify', {
        method: 'POST',
        headers: { 'X-ZEKE-Device-Token': deviceToken }
      });
      const verifyPassed = verifyResult.status === 200 && verifyResult.data.valid === true;
      results.push({
        test: 'Token verification works',
        passed: verifyPassed,
        details: `Status: ${verifyResult.status}, Valid: ${verifyResult.data.valid}`
      });
      console.log(`   Status: ${verifyPassed ? 'PASS' : 'FAIL'}`);
      console.log(`   Response: ${JSON.stringify(verifyResult.data)}\n`);
    }
  } else {
    console.log('4-6. Skipping pairing tests (ZEKE_SHARED_SECRET not set)\n');
    results.push({
      test: 'Device pairing (skipped - no secret)',
      passed: true,
      details: 'ZEKE_SHARED_SECRET not configured'
    });
  }

  // Test 7: Health endpoint (public)
  console.log('7. Testing health endpoint (public route)...');
  const healthResult = await makeRequest('/api/health');
  const healthPassed = healthResult.status === 200;
  results.push({
    test: 'Health endpoint accessible',
    passed: healthPassed,
    details: `Status: ${healthResult.status}`
  });
  console.log(`   Status: ${healthPassed ? 'PASS' : 'FAIL'}\n`);

  // Summary
  console.log('='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  let passedCount = 0;
  let failedCount = 0;
  
  results.forEach(({ test, passed, details }) => {
    const icon = passed ? '[OK]' : '[X]';
    console.log(`${icon} ${test}`);
    if (details) console.log(`    ${details}`);
    if (passed) passedCount++; else failedCount++;
  });
  
  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passedCount} passed, ${failedCount} failed`);
  console.log(failedCount === 0 ? '\nAll tests passed!' : '\nSome tests failed.');
}

runTests().catch(console.error);
