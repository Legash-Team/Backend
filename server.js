const dns = require('dns');
// Resolves MongoDB Atlas SRV records (using default system resolver)

const path = require('path');
const fs = require('fs');

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
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
const uploadRoutes = require('./src/routes/uploadRoutes');

// Middleware & Background Jobs
const verifyToken = require('./src/middleware/authMiddleware');
const requireRole = require('./src/middleware/requireRole');
const { startAutoCloseJob } = require('./src/jobs/autoCloseBloodRequests');

const app = express();

// Secure HTTP response headers (configured to allow Swagger UI scripts/styles)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      },
    },
  })
);

// Secure CORS origins in production (dynamically resolved on each request)
app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
        : [];
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS origin restriction.'));
      }
    },
    credentials: true,
  })
);

// HTTP Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

app.use(express.json());

// Prevent NoSQL query injection
app.use(mongoSanitize());

// API Rate Limiting for sensitive authentication/registration routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes.',
  },
  skip: () => process.env.NODE_ENV === 'test',
});

app.use('/api/auth/login', authLimiter);
app.use('/api/hospital/register', authLimiter);
app.use('/api/donor/register', authLimiter);
app.use('/api/donor/unlock', authLimiter);
app.use('/api/donor/verify-otp', authLimiter);
app.use('/api/hospital/verify-email', authLimiter);

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
app.use('/api/media', uploadRoutes);

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
      console.log(`Legash API running on port ${PORT}`);
      console.log(`Swagger Docs: http://localhost:${PORT}/api-docs`);
    });
    startAutoCloseJob();
  });
}

module.exports = app;