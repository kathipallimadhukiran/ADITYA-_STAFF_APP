// API URLs for different environments
const API_URLS = {
    local: 'http://10.0.2.2:5000',      // For Android Emulator
    localhost: 'http://localhost:5000',   // For web testing
    network: 'http://192.168.1.100:5000' // Replace with your computer's IP
};

const DEV_API_URL = API_URLS.local; // Default to Android Emulator
const PROD_API_URL = 'YOUR_PRODUCTION_API_URL';

const API_URL = __DEV__ ? DEV_API_URL : PROD_API_URL;

export const API_ENDPOINTS = {
    location: {
        save: `${API_URL}/api/location/save`,
        getByUser: (userId) => `${API_URL}/api/location/user/${userId}`,
        getByRole: (role) => `${API_URL}/api/location/role/${role}`,
    }
};

// Helper function to test API connection
export const testAPIConnection = async () => {
    try {
        console.log('Testing API connection to:', API_URL);
        const response = await fetch(`${API_URL}/api/test`);
        const data = await response.json();
        console.log('API Connection Test:', data);
        return true;
    } catch (error) {
        console.error('API Connection Test Failed:', error);
        // Try alternative URLs if the default fails
        for (const [key, url] of Object.entries(API_URLS)) {
            if (url === API_URL) continue; // Skip the one that failed
            try {
                console.log(`Trying alternative URL (${key}):`, url);
                const altResponse = await fetch(`${url}/api/test`);
                const altData = await altResponse.json();
                console.log('Alternative API Connection Successful:', altData);
                return true;
            } catch (altError) {
                console.error(`Alternative URL (${key}) failed:`, altError);
            }
        }
        return false;
    }
};

export default API_URL; 