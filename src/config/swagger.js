const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Legash API - Sprint 1',
      version: '1.0.0',
      description: 'Registration, login, and password reset endpoints',
    },
    servers: [{ url: 'http://localhost:3000/api' }],
  },
  // This tells Swagger which files to scan for the comment blocks
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;