FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --production

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy app code
COPY . .

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
