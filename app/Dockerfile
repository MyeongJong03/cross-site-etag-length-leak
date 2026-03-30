FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 make g++ \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "node db/seed.js && node --max-http-header-size=8192 server.js"]
