// Use built-in fetch (available in Node.js 18+)
// If you're using an older version, install node-fetch: npm install node-fetch

// Test URLs
const testUrls = [
  'http://localhost:5000/api/test',
  'http://10.0.2.2:5000/api/test',
  'http://0.0.0.0:5000/api/test',
  'http://127.0.0.1:5000/api/test'
];

async function testBackendConnection() {
  console.log('🔍 Testing backend connectivity...\n');
  
  for (const url of testUrls) {
    try {
      console.log(`Testing: ${url}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ SUCCESS: ${url}`);
        console.log(`   Response:`, data);
        console.log('');
        return url; // Return the working URL
      } else {
        console.log(`❌ FAILED: ${url} - Status: ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ FAILED: ${url} - ${error.message}`);
    }
    console.log('');
  }
  
  console.log('❌ All URLs failed. Please check if your backend server is running.');
  return null;
}

// Test location save endpoint
async function testLocationSave(workingUrl) {
  if (!workingUrl) {
    console.log('❌ Cannot test location save - no working URL found');
    return;
  }
  
  const locationData = {
    email: 'test@example.com',
    latitude: 12.9716,
    longitude: 77.5946,
    timestamp: '02-07-2025, 10:00:00 IST',
    formattedTime: '02-07-2025, 10:00:00 IST',
    isoTimestamp: new Date().toISOString(),
    accuracy: 10,
    speed: 0,
    heading: 0,
    altitude: 0,
    deviceInfo: { platform: 'test' },
    appState: 'active',
    isBackground: false,
    timezone: 'Asia/Kolkata',
    userRole: 'admin'
  };
  
  try {
    console.log('🔍 Testing location save...');
    const saveUrl = workingUrl.replace('/api/test', '/api/location/save');
    console.log(`Testing: ${saveUrl}`);
    
    const response = await fetch(saveUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(locationData)
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Location save SUCCESS:`);
      console.log(`   Response:`, data);
    } else {
      const errorData = await response.text();
      console.log(`❌ Location save FAILED: ${response.status}`);
      console.log(`   Error:`, errorData);
    }
  } catch (error) {
    console.log(`❌ Location save FAILED: ${error.message}`);
  }
}

// Run tests
async function runTests() {
  const workingUrl = await testBackendConnection();
  if (workingUrl) {
    await testLocationSave(workingUrl);
  }
}

runTests().catch(console.error); 