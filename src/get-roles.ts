import { Prisma } from './db/index.ts';

async function main() {
  const roles = await Prisma.role.findMany();
  process.stdout.write('ROLES_START\n');
  process.stdout.write(JSON.stringify(roles) + '\n');
  process.stdout.write('ROLES_END\n');
}

main().catch(console.error);
