// Environment configuration
const ENV = {
  development: {
    MONGODB_API_URL: 'mongodb+srv://kathipallimadhu:uJJLGhyTrL8aWFhS@cluster0.uw912pp.mongodb.net/',
    // For Android Emulator
    API_BASE_URL_EMULATOR: 'http://10.0.2.2:3000/api',
    // For iOS Simulator
    API_BASE_URL_IOS: 'http://localhost:3000/api',
    // For Physical Device (update with your computer's IP)
    API_BASE_URL_DEVICE: 'http://192.168.29.44:3000/api',
    // Default API URL
    API_BASE_URL: 'http://192.168.29.44:3000/api',
  },
  production: {
    MONGODB_API_URL: 'mongodb+srv://kathipallimadhu:uJJLGhyTrL8aWFhS@cluster0.uw912pp.mongodb.net/',
    API_BASE_URL: 'https://your-production-api.com/api',
  },
};

// Get current environment
const currentEnv = __DEV__ ? ENV.development : ENV.production;

export default currentEnv; 