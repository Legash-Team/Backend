// Entry point: Super Admin + Database + shared infra
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./src/config/swagger');
const hospitalAuthRoutes = require('./src/routes/hospitalAuthRoutes');
const sharedAuthRoutes = require('./src/routes/sharedAuthRoutes');

const donorAuthRoutes = require('./src/routes/donorAuthRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/hospital', hospitalAuthRoutes);
app.use('/api/auth', sharedAuthRoutes);

app.get('/', (req, res) => res.json({ status: 'Legash API running' }));

// Mount routes here, one line per person, added only when that person's file is ready:
app.use('/api/donor', donorAuthRoutes);

// Must stay LAST — after every route above.
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Legash API running on port ${PORT}`));
});