const mongoose = require('mongoose');

const deviceInfoSchema = new mongoose.Schema({
  brand: String,
  isDevice: Boolean,
  manufacturer: String,
  model: String,
  osVersion: String
}, { _id: false });

const locationSchema = new mongoose.Schema({
  accuracy: Number,
  altitude: Number,
  appState: String,
  deviceInfo: deviceInfoSchema,
  heading: Number,
  isBackground: Boolean,
  lastUpdate: { type: Date, default: Date.now },
  latitude: { type: Number, required: true },
  longitude: { type: Number, required: true },
  speed: Number,
  timestamp: { type: Date, default: Date.now },
  userId: { type: String, required: true, unique: true },
  userRole: { type: String, required: true },
  currentLocation: { type: mongoose.Schema.Types.Mixed },
  locationHistory: [{
    latitude: Number,
    longitude: Number,
    timestamp: Date,
    accuracy: Number,
    altitude: Number,
    speed: Number,
    heading: Number
  }]
}, {
  timestamps: true
});

// Create index for efficient querying
locationSchema.index({ userId: 1 });

const Location = mongoose.model('Location', locationSchema);

module.exports = Location; 