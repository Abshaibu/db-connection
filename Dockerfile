# Use an official Node.js runtime as a parent image
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies based on package-lock
COPY package.json package-lock.json ./
RUN npm ci --production

# Copy application source
COPY . ./

# Runtime image
FROM node:20-alpine AS runtime
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/public ./public
COPY --from=builder /app/server.js ./server.js

EXPOSE 3000

ENV PORT=3000
CMD ["node", "server.js"]
