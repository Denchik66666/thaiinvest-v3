const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('./lib/auth');

const prisma = new PrismaClient();

async function createTestInvestors() {
  try {
    const owner = await prisma.user.findFirst({ where: { username: 'Sam', role: 'OWNER' } });
    const admin = await prisma.user.findFirst({ where: { username: 'admin', role: 'SUPER_ADMIN' } });
    
    if (owner && admin) {
      // Create investor for admin
      const existingAdminInvestor = await prisma.investor.findFirst({
        where: { investorUserId: admin.id }
      });
      
      if (!existingAdminInvestor) {
        await prisma.investor.create({
          data: {
            ownerId: owner.id,
            investorUserId: admin.id,
            name: 'Test Investor Admin',
            handle: 'admin_investor',
            phone: '+1234567890',
            body: 100000,
            rate: 0.05,
            accrued: 25000,
            paid: 5000,
            entryDate: new Date('2024-01-01'),
            activationDate: new Date('2024-01-01'),
            status: 'active',
            isPrivate: false,
          }
        });
        console.log('Created investor for admin');
      }
      
      // Create additional test investors
      const testInvestors = [
        { name: 'John Doe', body: 50000, rate: 0.04, accrued: 10000, paid: 2000 },
        { name: 'Jane Smith', body: 75000, rate: 0.045, accrued: 16875, paid: 5000 },
        { name: 'Bob Wilson', body: 200000, rate: 0.06, accrued: 60000, paid: 15000 },
      ];
      
      for (const investor of testInvestors) {
        const exists = await prisma.investor.findFirst({
          where: { name: investor.name }
        });
        
        if (!exists) {
          await prisma.investor.create({
            data: {
              ownerId: owner.id,
              name: investor.name,
              handle: investor.name.toLowerCase().replace(' ', '_'),
              phone: '+1234567890',
              body: investor.body,
              rate: investor.rate,
              accrued: investor.accrued,
              paid: investor.paid,
              entryDate: new Date('2024-01-01'),
              activationDate: new Date('2024-01-01'),
              status: 'active',
              isPrivate: false,
            }
          });
          console.log(`Created investor: ${investor.name}`);
        }
      }
      
      console.log('Test investors created successfully!');
    } else {
      console.log('Owner or admin user not found');
    }
  } catch (error) {
    console.error('Error creating test investors:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestInvestors();
