import { Prisma } from './db/index.ts';

async function main() {
  const users = await Prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });
  console.log('USERS_START');
  console.log(JSON.stringify(users));
  console.log('USERS_END');
}

main().catch(console.error);
