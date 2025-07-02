const express = require('express');
const router = express.Router();
const Location = require('../models/Location');

// Save/Update location with email
router.post('/save', async (req, res) => {
  try {
    const locationData = req.body;
    
    console.log('📍 Received location data:', JSON.stringify(locationData, null, 2));
    
    if (!locationData.email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    if (!locationData.latitude || !locationData.longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }

    if (!locationData.userRole) {
      return res.status(400).json({ success: false, message: 'User role is required' });
    }

    // --- Fix: Parse timestamp to valid Date ---
    if (locationData.timestamp && typeof locationData.timestamp === 'string') {
      // Try to parse the string to a Date
      const parsed = Date.parse(locationData.timestamp);
      locationData.timestamp = isNaN(parsed) ? new Date() : new Date(parsed);
    }

    // First check if a document exists for this email
    const existingLocation = await Location.findOne({ email: locationData.email });

    let updatedLocation;
    
    if (!existingLocation) {
      // Create new document if it doesn't exist
      const newLocation = new Location({
        email: locationData.email,
        accuracy: locationData.accuracy,
        altitude: locationData.altitude,
        appState: locationData.appState,
        deviceInfo: locationData.deviceInfo,
        heading: locationData.heading,
        isBackground: locationData.isBackground,
        lastUpdate: new Date(),
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        timestamp: locationData.timestamp,
        userRole: locationData.userRole,
        currentLocation: locationData
      });

      console.log('🆕 Creating new location document for:', locationData.email);
      updatedLocation = await newLocation.save();
    } else {
      // Only update location-related fields if document exists
      console.log('🔄 Updating existing location document for:', locationData.email);
      updatedLocation = await Location.findOneAndUpdate(
        { email: locationData.email },
        { 
          $set: { 
            accuracy: locationData.accuracy,
            altitude: locationData.altitude,
            appState: locationData.appState,
            heading: locationData.heading,
            isBackground: locationData.isBackground,
            lastUpdate: new Date(),
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            speed: locationData.speed,
            timestamp: locationData.timestamp,
            currentLocation: locationData
          }
        },
        { new: true }
      );
    }

    if (!updatedLocation) {
      return res.status(404).json({ 
        success: false, 
        message: 'Failed to update location' 
      });
    }

    console.log('✅ Location saved successfully for:', locationData.email);
    res.status(200).json({ 
      success: true, 
      message: existingLocation ? 'Location updated successfully' : 'New location document created',
      data: updatedLocation
    });
  } catch (error) {
    console.error('❌ Error in /save route:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false, 
        message: 'Validation error',
        errors: validationErrors
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Error updating location',
      error: error.message
    });
  }
});

// Get location by email
router.get('/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const location = await Location.findOne({ email: email.toLowerCase() });
    
    if (!location) {
      return res.status(404).json({ 
        success: false, 
        message: 'No location found for this email' 
      });
    }

    res.status(200).json({
      success: true,
      data: location
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error getting location',
      error: error.message 
    });
  }
});

// Test endpoint
router.get('/test', async (req, res) => {
  try {
    res.status(200).json({ 
      success: true, 
      message: 'API is working' 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'API test failed' });
  }
});

module.exports = router; 