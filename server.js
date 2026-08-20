// Backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');

const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const hospitalRoutes = require('./src/routes/hospitalRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('./src/routes/donorAuthRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const feedbackController = require('./src/controllers/feedbackController');

const app = express();

app.use(cors());
app.use(express.json());

// Public Hospital Feedback Submission
app.post('/api/hospital/feedback', feedbackController.submitFeedback);

// Hospital Authentication & Verification
app.use('/api/hospital', hospitalAuthRoutes);

// Protected Hospital Operations (Profile, Blood Stock, Blood Requests)
app.use('/api/hospital', hospitalRoutes);

// Donor Routes (Auth, Profile, Notifications, Events, Blood Centers)
app.use('/api/donor', donorAuthRoutes);

// Shared Facility & SuperAdmin / Admin Auth
app.use('/api/auth', sharedAuthRoutes);

// Super Admin Operations
app.use('/api/superadmin', superAdminRoutes);

// Health check endpoint
app.get('/', (req, res) => res.json({ status: 'Legash API running' }));

// Global error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, () => console.log(`Legash API running on port ${PORT}`));
  });
}

module.exports = app;