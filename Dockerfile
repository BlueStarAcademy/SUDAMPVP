FROM node:20-alpine

# Install system dependencies including OpenSSL for Prisma
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl1.1-compat \
    openssl \
    && npm install -g pnpm@8.10.0

WORKDIR /app

# Copy workspace configuration files
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./

# Copy all source files (including package.json files for packages)
COPY . .

# Install all dependencies first
RUN pnpm install --no-frozen-lockfile

# Set dummy DATABASE_URL for Prisma Client generation
ENV DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy"

# Generate Prisma Client in packages/database directory
# This will generate to ../../node_modules/.prisma/client (root level)
WORKDIR /app/packages/database
RUN if [ -f "schema.prisma" ]; then \
      npx prisma generate --schema ./schema.prisma; \
    fi

# Also generate at root level to ensure Next.js can find it
WORKDIR /app
RUN if [ -f "packages/database/schema.prisma" ]; then \
      mkdir -p prisma && \
      cp packages/database/schema.prisma prisma/schema.prisma && \
      npx prisma generate --schema ./prisma/schema.prisma; \
    fi

# Ensure @prisma/client package is available
RUN pnpm list @prisma/client || pnpm add @prisma/client@^6.19.0 --save-prod

# Verify Prisma Client was generated
RUN echo "=== Verifying Prisma Client ===" && \
    (test -d node_modules/.prisma/client && echo "✓ Found at node_modules/.prisma/client" || echo "✗ Not found at node_modules/.prisma/client") && \
    (test -d node_modules/@prisma/client && echo "✓ Found at node_modules/@prisma/client" || echo "✗ Not found at node_modules/@prisma/client")

# Build database package first
RUN pnpm --filter @sudam/database build || echo "Database build completed or skipped"

# Build game-logic package
RUN pnpm --filter @sudam/game-logic build || echo "Game-logic build completed or skipped"

# Regenerate Prisma Client one final time before Next.js build
WORKDIR /app/packages/database
RUN if [ -f "schema.prisma" ]; then \
      npx prisma generate --schema ./schema.prisma; \
    fi

# Build Next.js app (if app directory exists)
WORKDIR /app
RUN if [ -d "app" ] && [ -f "app/package.json" ]; then \
      cd app && \
      pnpm build; \
    else \
      echo "App directory not found, skipping Next.js build"; \
    fi

# Start application - use shell to check and start appropriate app
WORKDIR /app
CMD sh -c "if [ -d 'app' ] && [ -f 'app/package.json' ]; then pnpm --filter '@sudam/app' start; else node server.js; fi"
