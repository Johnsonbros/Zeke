import crypto from 'crypto';

const BASE_URL = 'http://localhost:5000';

const SHARED_SECRET = process.env.ZEKE_SHARED_SECRET || '';

if (!SHARED_SECRET) {
  console.error('ERROR: ZEKE_SHARED_SECRET environment variable is not set');
  process.exit(1);
}

interface SignedRequestOptions {
  method: string;
  path: string;
  body?: object;
}

function generateSignedHeaders(options: SignedRequestOptions): Record<string, string> {
  const { method, path, body } = options;
  
  const timestamp = Date.now().toString();
  const nonce = crypto.randomUUID();
  const bodyString = body ? JSON.stringify(body) : '';
  const bodyHash = crypto.createHash('sha256').update(bodyString).digest('hex');
  
  const payload = `${timestamp}.${nonce}.${method}.${path}.${bodyHash}`;
  const signature = crypto.createHmac('sha256', SHARED_SECRET).update(payload).digest('hex');
  
  console.log('\n--- Signing Details ---');
  console.log('Timestamp:', timestamp);
  console.log('Nonce:', nonce);
  console.log('Method:', method);
  console.log('Path:', path);
  console.log('Body Hash:', bodyHash);
  console.log('Payload:', payload);
  console.log('Signature:', signature.substring(0, 20) + '...');
  
  return {
    'X-ZEKE-Signature': signature,
    'X-ZEKE-Timestamp': timestamp,
    'X-ZEKE-Nonce': nonce,
    'Content-Type': 'application/json',
  };
}

async function testRequest(
  description: string, 
  options: SignedRequestOptions, 
  modifyHeaders?: (headers: Record<string, string>) => Record<string, string>
): Promise<boolean> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${description}`);
  console.log('='.repeat(60));
  
  let headers = generateSignedHeaders(options);
  
  if (modifyHeaders) {
    headers = modifyHeaders(headers);
  }
  
  const url = `${BASE_URL}${options.path}`;
  console.log('\nRequest URL:', url);
  
  try {
    const response = await fetch(url, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    
    const status = response.status;
    let responseText = '';
    try {
      responseText = await response.text();
    } catch (e) {
      responseText = '[Could not read response body]';
    }
    
    console.log('\nResponse Status:', status);
    console.log('Response:', responseText.substring(0, 200) + (responseText.length > 200 ? '...' : ''));
    
    return status !== 401 && status !== 403;
  } catch (error) {
    console.error('Request failed:', error);
    return false;
  }
}

async function checkSecurityLogs(): Promise<void> {
  console.log(`\n${'='.repeat(60)}`);
  console.log('SECURITY LOGS');
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${BASE_URL}/api/mobile/security/logs`);
    const data = await response.json();
    console.log('\nSummary:', JSON.stringify(data.summary, null, 2));
    console.log('\nRecent entries:', data.logs?.length || 0);
    if (data.logs?.length > 0) {
      console.log('Last 3 entries:');
      data.logs.slice(0, 3).forEach((log: any, i: number) => {
        console.log(`  ${i + 1}. ${log.timestamp} - ${log.verified ? 'VERIFIED' : 'REJECTED'} - ${log.method} ${log.path}`);
        if (log.reason) console.log(`     Reason: ${log.reason}`);
      });
    }
  } catch (error) {
    console.error('Failed to fetch security logs:', error);
  }
}

async function runTests(): Promise<void> {
  console.log('\n');
  console.log('#'.repeat(60));
  console.log('# ZEKE Mobile App HMAC Authentication Test Suite');
  console.log('#'.repeat(60));
  console.log('\nBase URL:', BASE_URL);
  console.log('Secret configured:', SHARED_SECRET ? 'Yes (length: ' + SHARED_SECRET.length + ')' : 'No');
  
  const results: { test: string; passed: boolean }[] = [];
  
  const validRequest = await testRequest(
    '1. Valid signature on protected route (GET /api/tasks)',
    { method: 'GET', path: '/api/tasks' }
  );
  results.push({ test: 'Valid signature', passed: validRequest });
  
  const invalidSignature = await testRequest(
    '2. Invalid signature (should be rejected)',
    { method: 'GET', path: '/api/tasks' },
    (headers) => ({ ...headers, 'X-ZEKE-Signature': 'invalid_signature_here' })
  );
  results.push({ test: 'Invalid signature rejected', passed: !invalidSignature });
  
  const expiredTimestamp = await testRequest(
    '3. Expired timestamp (10 minutes old - should be rejected)',
    { method: 'GET', path: '/api/tasks' },
    (headers) => ({ 
      ...headers, 
      'X-ZEKE-Timestamp': (Date.now() - 10 * 60 * 1000).toString() 
    })
  );
  results.push({ test: 'Expired timestamp rejected', passed: !expiredTimestamp });
  
  const missingHeaders = await testRequest(
    '4. Missing signature header (should be rejected)',
    { method: 'GET', path: '/api/grocery' },
    (headers) => {
      const { 'X-ZEKE-Signature': _, ...rest } = headers;
      return rest;
    }
  );
  results.push({ test: 'Missing headers rejected', passed: !missingHeaders });
  
  const postWithBody = await testRequest(
    '5. Valid POST with body (POST /api/chat)',
    { 
      method: 'POST', 
      path: '/api/chat',
      body: { message: 'Test message from mobile app' }
    }
  );
  results.push({ test: 'POST with body', passed: postWithBody });
  
  await checkSecurityLogs();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  
  let allPassed = true;
  results.forEach(({ test, passed }) => {
    const status = passed ? 'PASS' : 'FAIL';
    const icon = passed ? '[OK]' : '[X]';
    console.log(`${icon} ${test}: ${status}`);
    if (!passed) allPassed = false;
  });
  
  console.log('\n' + (allPassed ? 'All tests passed!' : 'Some tests failed.'));
  console.log('\n');
}

runTests().catch(console.error);
