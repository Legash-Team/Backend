// Backend/src/config/swagger.js
const fs = require('fs');
const path = require('path');

const openApiPath = path.resolve(__dirname, '../../openapi.json');
let openApiSpec = {};

try {
  if (fs.existsSync(openApiPath)) {
    openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));

    // Dynamic servers based on environment or relative path
    const serverUrl = process.env.API_BASE_URL || '/';
    openApiSpec.servers = [
      {
        url: serverUrl,
        description: process.env.NODE_ENV === 'production' ? 'Production Gateway' : 'Local Server',
      },
      {
        url: 'https://backend-qifm.onrender.com',
        description: 'Render Cloud Server',
      },
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
    ];
  }
} catch (err) {
  console.warn('⚠️ Could not load openapi.json directly, using fallback.', err.message);
}

module.exports = openApiSpec;