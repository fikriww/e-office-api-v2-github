import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function check() {
  try {
    const users = await prisma.user.findMany({
      include: { pegawai: true }
    });
    console.log("Total users:", users.length);
    
    // We can't check Casbin easily here without setup, but we can check the UserRole table if it's used as a cache/mirror
    const userRoles = await prisma.userRole.findMany({
      include: { role: true, user: true }
    });
    console.log("User roles in DB:", userRoles.map(ur => ({ email: ur.user.email, role: ur.role.name })));

    const signatures = await prisma.signature.findMany({
      include: { user: true }
    });
    console.log("Total signatures:", signatures.length);
    console.log("Signatures details:", signatures.map(s => ({ email: s.user.email, url: s.imageUrl })));
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

check();
