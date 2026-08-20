# Use official Node.js LTS Alpine image for minimal image size and security
FROM node:20-alpine AS production

# Set working directory inside container
WORKDIR /app

# Copy package files first to leverage Docker layer caching
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy the rest of the application source code
COPY . .

# Expose the application port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Run the application directly with node (not nodemon)
CMD ["node", "server.js"]