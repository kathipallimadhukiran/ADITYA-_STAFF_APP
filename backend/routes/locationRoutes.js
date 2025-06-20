const express = require('express');
const router = express.Router();
const Location = require('../models/Location');

// Save/Update location
router.post('/', async (req, res) => {
  try {
    const locationData = req.body;
    
    // Update or create location document for user
    const updatedLocation = await Location.findOneAndUpdate(
      { userId: locationData.userId },
      { 
        $set: { 
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

    res.status(200).json({ success: true, message: 'Location updated successfully' });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: 'Error updating location' });
  }
});

// Get user's last location
router.get('/last/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const location = await Location.findOne({ userId });
    res.json(location || null);
  } catch (error) {
    console.error('Error getting last location:', error);
    res.status(500).json({ success: false, message: 'Error getting last location' });
  }
});

// Get user's location history within date range
router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    const query = { userId };
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const locations = await Location.find(query).sort({ timestamp: -1 });
    res.json(locations);
  } catch (error) {
    console.error('Error getting location history:', error);
    res.status(500).json({ success: false, message: 'Error getting location history' });
  }
});

module.exports = router; 