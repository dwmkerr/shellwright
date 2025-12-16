FROM node:20-slim

WORKDIR /app

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash shellwright \
    && chown -R shellwright:shellwright /app
USER shellwright

# Port 7498 spells SWRT (Shellwright) on a dialpad
EXPOSE 7498

CMD ["node", "dist/index.js"]
