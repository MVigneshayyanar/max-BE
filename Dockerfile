FROM node:20-alpine

# Install OpenSSL & libc compatibility for Prisma engine in Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

# Copy package files and prisma schema before npm ci so postinstall works
COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Install dependencies (runs postinstall: prisma generate)
RUN npm ci --omit=dev

# Copy application source code
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
