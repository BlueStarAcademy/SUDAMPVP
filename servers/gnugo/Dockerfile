FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    gnugo \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server files
COPY server.js .

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server.js"]

