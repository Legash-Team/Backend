// Backend/server.js
const dns = require('dns');
// Resolves MongoDB Atlas SRV records reliably across local networks/ISPs
dns.setServers(['8.8.8.8', '8.8.4.4']);

const path = require('path');
const fs = require('fs');

// Attempt to load .env from Backend/ or project root
const envPaths = [
  path.join(__dirname, '.env'),
  path.join(__dirname, '../.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
    break;
  }
}

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');

// Route & Controller imports
const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const hospitalRoutes = require('./src/routes/hospitalRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('./src/routes/donorAuthRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const bloodRequestRoutes = require('./src/routes/bloodRequestRoutes');
const donorNotificationRoutes = require('./src/routes/donorNotificationRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const feedbackController = require('./src/controllers/feedbackController');
const donorNotificationController = require('./src/controllers/donorNotificationController');
const inventoryRoutes = require('./src/routes/inventoryRoutes');

// Middleware & Background Jobs
const verifyToken = require('./src/middleware/authMiddleware');
const requireRole = require('./src/middleware/requireRole');
const { startAutoCloseJob } = require('./src/jobs/autoCloseBloodRequests');

const app = express();

app.use(cors());
app.use(express.json());

// Serve raw OpenAPI 3.1.0 specification
const openapiSpecPath = path.resolve(__dirname, 'openapi.json');
let openapiSpec = {};
if (fs.existsSync(openapiSpecPath)) {
  openapiSpec = JSON.parse(fs.readFileSync(openapiSpecPath, 'utf8'));
}

app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(openapiSpecPath);
});

// Serve Interactive Swagger UI using the OpenAPI 3.1.0 spec
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));

// Public Hospital Feedback Submission
app.post('/api/hospital/feedback', feedbackController.submitFeedback);

// Core API Routes
app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/hospital/blood-requests', bloodRequestRoutes);
app.use('/api/donor', donorAuthRoutes);
app.use('/api/donor/notifications', donorNotificationRoutes);
app.post('/api/donor/push-token', verifyToken, requireRole('donor'), donorNotificationController.registerPushToken);
app.use('/api/donor/events', eventRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/superadmin', superAdminRoutes);

// Facility Inventory Routes (Sprint 2 Contract)
app.use('/v1/inventory', inventoryRoutes);

// Health check endpoint
app.get('/', (req, res) =>
  res.json({
    status: 'Legash API running',
    docs: '/api-docs',
    openapi: '/openapi.json',
  })
);

// Global error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Legash API running on port ${PORT}`);
      console.log(`📖 Swagger Docs: http://localhost:${PORT}/api-docs`);
    });
    startAutoCloseJob();
  });
}

module.exports = app;