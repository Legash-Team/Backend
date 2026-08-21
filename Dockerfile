# Use a lightweight Node.js base image
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package descriptors first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy the rest of the application source code
COPY . .

# Expose the API port (default: 3000)
EXPOSE 3000

# Set Node environment variables
ENV NODE_ENV=production

# Run the API server
CMD ["node", "server.js"]
