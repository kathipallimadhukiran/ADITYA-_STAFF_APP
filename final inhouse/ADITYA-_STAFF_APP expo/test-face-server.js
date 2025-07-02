// Test script for face recognition server connectivity
const axios = require('axios');

const SERVER_URL = 'http://192.168.29.44:8080';

async function testFaceServer() {
  console.log('🔍 Testing Face Recognition Server Connectivity...\n');
  
  const testEndpoints = [
    { path: '/health', method: 'GET', description: 'Health Check' },
    { path: '/get_current_user?user_id=test', method: 'GET', description: 'Get Current User' },
    { path: '/recognize_face', method: 'POST', description: 'Face Recognition (POST)' },
    { path: '/train_face', method: 'POST', description: 'Face Training (POST)' },
    { path: '/verify_training', method: 'POST', description: 'Training Verification (POST)' }
  ];

  for (const endpoint of testEndpoints) {
    try {
      console.log(`Testing: ${endpoint.description}`);
      console.log(`URL: ${SERVER_URL}${endpoint.path}`);
      
      const config = {
        method: endpoint.method,
        url: `${SERVER_URL}${endpoint.path}`,
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      };

      // Add sample data for POST requests
      if (endpoint.method === 'POST') {
        if (endpoint.path === '/train_face') {
          config.data = {
            person_name: 'Test User',
            user_mail: 'test@example.com',
            images: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'] // Minimal base64 image
          };
        } else if (endpoint.path === '/verify_training') {
          config.data = {
            user_mail: 'test@example.com',
            person_name: 'Test User'
          };
        } else {
          config.data = {
            image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...', // Minimal base64 image
            person_name: 'Test User',
            user_mail: 'test@example.com'
          };
        }
      }

      const response = await axios(config);
      
      console.log(`✅ SUCCESS: ${endpoint.description}`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Response:`, response.data);
      console.log('');
      
    } catch (error) {
      console.log(`❌ FAILED: ${endpoint.description}`);
      
      if (error.code === 'ECONNABORTED') {
        console.log(`   Error: Request timed out after 10 seconds`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   Error: Connection refused - server may not be running`);
      } else if (error.message.includes('Network Error')) {
        console.log(`   Error: Network error - check if server is accessible`);
      } else if (error.response) {
        console.log(`   Error: HTTP ${error.response.status} - ${error.response.statusText}`);
        console.log(`   Response:`, error.response.data);
      } else {
        console.log(`   Error: ${error.message}`);
      }
      console.log('');
    }
  }
  
  console.log('🏁 Testing completed!');
}

// Run the test
testFaceServer().catch(console.error); 