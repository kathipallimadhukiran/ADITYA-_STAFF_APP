const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const locationRoutes = require('./routes/locationRoutes');

const app = express();

// Configure CORS to accept requests from your app
app.use(cors({
  origin: '*', // Allow all origins for testing
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase payload limit for location data
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MongoDB Connection URL
const MONGODB_URL = 'mongodb+srv://kathipallimadhu:uJJLGhyTrL8aWFhS@cluster0.uw912pp.mongodb.net/';

// MongoDB Connection
mongoose.connect(MONGODB_URL, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch((err) => console.error('MongoDB connection error:', err));

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API is working' });
});

// Routes - Mount directly at /api/location
app.use('/api/location', locationRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    success: false, 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Listen on all network interfaces

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
  console.log('Try accessing:');
  console.log(`- Local: http://localhost:${PORT}`);
  console.log(`- Network: http://192.168.29.44:${PORT}`);
}); 