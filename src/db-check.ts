import { Prisma } from './db/index.ts';

async function main() {
  console.log('--- List of Roles ---');
  const roles = await Prisma.role.findMany();
  console.log(JSON.stringify(roles, null, 2));

  console.log('\n--- List of Users ---');
  const users = await Prisma.user.findMany({
    include: {
      userRole: {
        include: {
          role: true
        }
      }
    }
  });
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // await Prisma.$disconnect();
  });
