const fetch = require('node-fetch');

async function testLocationAPI() {
  const testData = {
    email: 'test@example.com',
    latitude: 12.9716,
    longitude: 77.5946,
    userRole: 'staff',
    timestamp: '02-07-2025, 10:00:00 IST',
    accuracy: 10,
    speed: 0,
    heading: 0,
    altitude: 0,
    deviceInfo: { platform: 'test' },
    appState: 'active',
    isBackground: false,
    timezone: 'Asia/Kolkata'
  };

  try {
    console.log('Testing location save API...');
    console.log('Data being sent:', JSON.stringify(testData, null, 2));
    
    const response = await fetch('http://192.168.29.44:5000/api/location/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testData)
    });

    console.log('Response status:', response.status);
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.ok) {
      console.log('✅ API call successful!');
    } else {
      console.log('❌ API call failed with status:', response.status);
    }
  } catch (error) {
    console.error('❌ Error testing API:', error);
  }
}

testLocationAPI(); 