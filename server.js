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
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');

const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');
const donorAuthRoutes = require('./src/routes/donorAuthRoutes');
const inventoryRoutes = require('./src/routes/inventoryRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/hospitals', hospitalAuthRoutes); // Alias
app.use('/api/auth', sharedAuthRoutes);
app.use('/api/donor', donorAuthRoutes);
app.use('/v1/donor', donorAuthRoutes);         // ★ Mount v1 alias
app.use('/v1/inventory', inventoryRoutes);

app.get('/', (req, res) => res.json({ status: 'Legash API running' }));

// Global error handler must stay LAST
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Legash API running on port ${PORT}`));
});