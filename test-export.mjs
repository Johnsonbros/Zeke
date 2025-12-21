import fetch from 'node-fetch';

async function testExport() {
  try {
    console.log('Testing export endpoint...');
    const response = await fetch('http://localhost:5000/api/export');
    
    if (!response.ok) {
      console.error('Export failed:', response.status, response.statusText);
      return;
    }
    
    const data = await response.json();
    console.log('\n✓ Export successful!');
    console.log('\nExport metadata:');
    console.log('  Version:', data.version);
    console.log('  Exported at:', data.exportedAt);
    
    console.log('\nData categories exported:');
    for (const [key, value] of Object.entries(data.data)) {
      if (Array.isArray(value)) {
        console.log(`  - ${key}: ${value.length} items`);
      } else if (typeof value === 'object' && value !== null) {
        const count = Object.keys(value).length;
        console.log(`  - ${key}: ${count} items`);
      } else {
        console.log(`  - ${key}: ${value}`);
      }
    }
  } catch (error) {
    console.error('Error testing export:', error.message);
  }
}

testExport();
