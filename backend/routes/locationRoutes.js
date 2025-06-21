const express = require('express');
const router = express.Router();
const Location = require('../models/Location');

// Save/Update location with email
router.post('/save', async (req, res) => {
  try {
    const locationData = req.body;
    
    if (!locationData.email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    // Update or create location document for user by email
    const updatedLocation = await Location.findOneAndUpdate(
      { email: locationData.email },
      { 
        $set: { 
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
        }
      },
      { 
        upsert: true, 
        new: true,
        setDefaultsOnInsert: true 
      }
    );

    res.status(200).json({ 
      success: true, 
      message: 'Location updated successfully',
      data: updatedLocation
    });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Error updating location' });
  }
});

// Get location by email
router.get('/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const location = await Location.findOne({ email });
    
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
    console.error('Error getting location by email:', error);
    res.status(500).json({ success: false, message: 'Error getting location' });
  }
});

// Add a test endpoint
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