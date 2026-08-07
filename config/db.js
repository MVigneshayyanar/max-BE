const { PrismaClient } = require('@prisma/client');

// Singleton PrismaClient instance to prevent connection pool exhaustion
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});

module.exports = prisma;
