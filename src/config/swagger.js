// Backend/src/config/swagger.js
const fs = require('fs');
const path = require('path');

const openApiPath = path.resolve(__dirname, '../../openapi.json');
let openApiSpec = {};

try {
  if (fs.existsSync(openApiPath)) {
    openApiSpec = JSON.parse(fs.readFileSync(openApiPath, 'utf8'));
  }
} catch (err) {
  console.warn('⚠️ Could not load openapi.json directly, using fallback.', err.message);
}

module.exports = openApiSpec;