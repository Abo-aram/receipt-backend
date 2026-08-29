FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first (better Docker layer caching)
COPY package*.json ./
RUN npm ci --only=production

# Copy application source code
COPY . .

# Expose port (default 3000, or provided by host $PORT)
EXPOSE 3000

ENV NODE_ENV=production

# Start production server
CMD ["node", "server.js"]
