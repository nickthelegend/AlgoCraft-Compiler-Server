FROM node:22-slim

ENV NODE_ENV=production
ENV PATH=/usr/local/bin:/root/.local/bin:$PATH

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y curl ca-certificates python3 python3-pip python3-venv && \
    python3 -m pip install --user --break-system-packages pipx && \
    python3 -m pipx ensurepath && \
    rm -rf /var/lib/apt/lists/*

# Install AlgoKit via pipx
RUN pipx install algokit

# Download Puya binary and extract it
RUN mkdir -p /app/puya && \
    cd /app/puya && \
    curl -L -o puya.tar.gz https://nickthelegend.github.io/puya-mirror/src/puya-4.7.0-linux_x64.tar.gz && \
    tar -xzf puya.tar.gz && \
    chmod +x /app/puya/puya && \
    rm puya.tar.gz

# Install global npm packages
RUN npm install -g @algorandfoundation/puya-ts @algorandfoundation/tealscript

# Copy package files and install dependencies
COPY package.json package-lock.json* ./
COPY tsconfig.json ./
RUN npm ci

# Install local dependencies
RUN npm install @algorandfoundation/algorand-typescript

# Copy app source
COPY server.js ./

# Pre-seed templates for faster compilation
RUN mkdir -p /tmp/puya-template && \
    cp package.json /tmp/puya-template/ && \
    cd /tmp/puya-template && \
    npm install @algorandfoundation/algorand-typescript && \
    chmod -R 755 /tmp/puya-template

RUN mkdir -p /tmp/tealscript-template && \
    cp package.json /tmp/tealscript-template/ && \
    cp tsconfig.json /tmp/tealscript-template/ && \
    cd /tmp/tealscript-template && \
    npm install @algorandfoundation/tealscript && \
    chmod -R 755 /tmp/tealscript-template

# Create temp directories
RUN mkdir -p /app/tmp

EXPOSE 3000

CMD ["node", "server.js"]