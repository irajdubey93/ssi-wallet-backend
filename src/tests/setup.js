const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Clean up database before/after tests
beforeAll(async () => {
  // Connect to database
  await prisma.$connect();
});

afterAll(async () => {
  // Clean up and disconnect
  await prisma.verifiableCredential.deleteMany();
  await prisma.dID.deleteMany();
  await prisma.session.deleteMany();
  await prisma.challenge.deleteMany();
  await prisma.holder.deleteMany();
  await prisma.$disconnect();
});

// Export prisma for tests
module.exports = { prisma };
