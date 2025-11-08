FROM python:3.12-slim

ENV NODE_ENV=production
ENV PATH=/usr/local/bin:/root/.local/bin:$PATH
ENV ALGOD_PORT=443
ENV ALGOD_SERVER=https://testnet-api.4160.nodely.dev

WORKDIR /app

# Install Node.js 22
RUN apt-get update && \
    apt-get install -y curl ca-certificates gnupg && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list && \
    apt-get update && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Install pipx and AlgoKit
RUN pip install pipx && \
    pipx install algokit && \
    pipx ensurepath



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
COPY package.json ./
COPY tsconfig.json ./
RUN npm install

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