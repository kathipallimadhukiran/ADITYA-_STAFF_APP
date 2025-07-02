// Test script to verify connectivity logic
const axios = require('axios');

const SERVER_URL = 'http://192.168.29.44:8080';

async function testConnectivityLogic() {
  console.log('🔍 Testing Connectivity Logic...\n');
  
  try {
    console.log(`Testing connection to: ${SERVER_URL}/`);
    
    const response = await axios.get(`${SERVER_URL}/`, {
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    console.log('✅ SUCCESS: Server responded with status:', response.status);
    console.log('   This means server is running and has a root endpoint');
    
  } catch (error) {
    console.log('📋 Analyzing error response...');
    
    if (error.response?.status === 404) {
      console.log('✅ EXPECTED BEHAVIOR: 404 response');
      console.log('   This means:');
      console.log('   - Server is running ✅');
      console.log('   - Server is reachable ✅');
      console.log('   - Root endpoint (/) doesn\'t exist (which is normal) ✅');
      console.log('   - Should be treated as "CONNECTED" ✅');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ ERROR: Connection refused');
      console.log('   This means server is not running');
    } else if (error.code === 'ECONNABORTED') {
      console.log('❌ ERROR: Request timed out');
      console.log('   This means server is not responding');
    } else if (error.message.includes('Network Error')) {
      console.log('❌ ERROR: Network error');
      console.log('   This means network connectivity issue');
    } else {
      console.log('❌ UNEXPECTED ERROR:', error.message);
    }
  }
  
  console.log('\n🏁 Test completed!');
}

// Run the test
testConnectivityLogic().catch(console.error); 