// Backend/server.js
const dns = require('dns');
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
const swaggerSpec = require('./src/config/swagger');

const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const hospitalRoutes = require('./src/routes/hospitalRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('./src/routes/donorAuthRoutes');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const feedbackController = require('./src/controllers/feedbackController');

const app = express();

app.use(cors());
app.use(express.json());

// Serve raw OpenAPI 3.1.0 specification
app.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(path.resolve(__dirname, 'openapi.json'));
});

// Serve Interactive Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Public Hospital Feedback Submission
app.post('/api/hospital/feedback', feedbackController.submitFeedback);

// Routes
app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/hospital', hospitalRoutes);
app.use('/api/donor', donorAuthRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/superadmin', superAdminRoutes);

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
    app.listen(PORT, () =>
      console.log(`Legash API running on port ${PORT} (Swagger Docs: http://localhost:${PORT}/api-docs)`)
    );
  });
}

module.exports = app;