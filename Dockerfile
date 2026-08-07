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

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start with migrations
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
