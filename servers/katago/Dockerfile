FROM ubuntu:22.04

# Install dependencies
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    nodejs \
    npm \
    && rm -rf /var/lib/apt/lists/*

# Download KataGo (CPU only version)
WORKDIR /katago
RUN wget https://github.com/lightvector/KataGo/releases/download/v1.13.0/katago-v1.13.0-linux-x64.zip && \
    unzip katago-v1.13.0-linux-x64.zip && \
    chmod +x katago && \
    mv katago /usr/local/bin/

# Download smaller KataGo model (CPU optimized)
# kata1-b40c256: CPU에서도 잘 작동하는 작은 모델
RUN mkdir -p /katago-models && \
    wget https://media.katagotraining.org/uploaded/networks/models/kata1/kata1-b40c256-s11101799168-d2715431527.bin.gz -O /katago-models/kata1-b40c256-s11101799168-d2715431527.bin.gz

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy server files and config
COPY server.js .
COPY config_gtp.cfg .

# Expose port
EXPOSE 3002

# Start server (CPU only mode)
CMD ["node", "server.js"]

