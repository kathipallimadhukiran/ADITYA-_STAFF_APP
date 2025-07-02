// Environment configuration
const ENV = process.env.NODE_ENV || 'development';

// API URLs for different environments
const API_URLS = {
    development: 'http://192.168.29.44:5000',    // Local network IP for physical device testing
    localhost: 'http://localhost:5000',          // For local development
    test: 'http://0.0.0.0:5000',                 // For testing
    production: 'https://your-app.onrender.com'  // Replace with your Render URL after deployment
};

// Select the appropriate API URL based on environment
const getApiUrl = () => {
    if (__DEV__) {
        // For development in React Native
        return API_URLS.development;
    }
    return API_URLS[ENV] || API_URLS.production;
};

const API_URL = getApiUrl();

// API Endpoints
export const API_ENDPOINTS = {
    location: {
        save: `${API_URL}/api/location/save`,
        getByUser: (userId) => `${API_URL}/api/location/user/${userId}`,
        getByRole: (role) => `${API_URL}/api/location/role/${role}`,
        getByEmail: (email) => `${API_URL}/api/location/email/${encodeURIComponent(email)}`,
        saveWithEmail: `${API_URL}/api/location/save`,
        test: `${API_URL}/api/location/test`
    },
    auth: {
        test: `${API_URL}/api/test`
    }
};

// Default headers for API requests
export const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
};

/**
 * Tests the API connection with retry logic
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {number} retryDelay - Delay between retries in milliseconds
 * @returns {Promise<{success: boolean, error?: string}>} - Connection test result
 */
export const testApiConnection = async (maxRetries = 3, retryDelay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[API] Testing connection to ${API_URL} (Attempt ${attempt}/${maxRetries})`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(API_ENDPOINTS.auth.test, {
                method: 'GET',
                headers: DEFAULT_HEADERS,
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('[API] Connection successful:', data);
            return { success: true };
            
        } catch (error) {
            lastError = error;
            console.warn(`[API] Connection attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                console.log(`[API] Retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                // Exponential backoff
                retryDelay *= 2;
            }
        }
    }
    
    console.error('[API] All connection attempts failed');
    return { 
        success: false, 
        error: lastError?.message || 'Failed to connect to API',
        url: API_URL
    };
};

// Utility function to make API requests with error handling
export const apiRequest = async (endpoint, options = {}) => {
    const defaultOptions = {
        headers: DEFAULT_HEADERS,
        timeout: 10000 // 10 seconds timeout
    };
    
    try {
        const response = await fetch(endpoint, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
        
    } catch (error) {
        console.error('[API] Request failed:', error);
        throw error; // Re-throw to allow caller to handle
    }
};

export default API_URL;