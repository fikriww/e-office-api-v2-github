import { Prisma } from './db/index.ts';

async function main() {
  const user = await Prisma.user.findUnique({
    where: { email: 'superadmin' },
    include: {
      userRole: {
        include: {
          role: true
        }
      }
    }
  });
  process.stdout.write('USER_CHECK_START\n');
  process.stdout.write(JSON.stringify(user) + '\n');
  process.stdout.write('USER_CHECK_END\n');
}

main().catch(console.error);
