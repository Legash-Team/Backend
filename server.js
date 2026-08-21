require('dotenv').config();
const admin = require('firebase-admin');

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin initialized.');
  } catch (error) {
    console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
  }
} else {
  console.warn('FIREBASE_SERVICE_ACCOUNT_JSON is not set. Push notifications will be disabled.');
}
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const verifyToken = require('./src/middleware/authMiddleware');
const requireRole = require('./src/middleware/requireRole');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');

const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('./src/routes/donorAuthRoutes');
const bloodRequestRoutes = require('./src/routes/bloodRequestRoutes');
const donorNotificationRoutes = require('./src/routes/donorNotificationRoutes');
const donorNotificationController = require('./src/controllers/donorNotificationController');
const superAdminRoutes = require('./src/routes/superAdminRoutes');
const eventRoutes = require('./src/routes/eventRoutes');
const startAutoCloseJob = require('./src/jobs/autoCloseBloodRequests');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/donor', donorAuthRoutes);

app.get('/', (req, res) => res.json({ status: 'Legash API running' }));

app.use('/api/hospital/blood-requests', bloodRequestRoutes);
app.use('/api/donor/notifications', donorNotificationRoutes);
app.post('/api/donor/push-token', verifyToken, requireRole('donor'), donorNotificationController.registerPushToken);
app.use('/api/superadmin', superAdminRoutes);
app.use('/api/donor/events', eventRoutes);

// Must stay LAST — after every route above.
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Legash API running on port ${PORT}`));
  startAutoCloseJob();
});