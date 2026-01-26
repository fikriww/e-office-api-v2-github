// Script to clean up duplicate permissions before migration
import { Prisma } from "@backend/db/index.ts";

async function cleanupDuplicates() {
  console.log("Checking for duplicate permissions...");
  
  // Get all permissions
  const permissions = await Prisma.permission.findMany();
  
  // Group by resource+action
  const groups = new Map<string, typeof permissions>();
  for (const perm of permissions) {
    const key = `${perm.resource}:${perm.action}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(perm);
  }
  
  // Find duplicates and delete extras
  for (const [key, perms] of groups) {
    if (perms.length > 1) {
      console.log(`Found ${perms.length} duplicates for ${key}`);
      // Keep the first one, delete the rest
      const toDelete = perms.slice(1);
      for (const perm of toDelete) {
        // First delete related RolePermission entries
        await Prisma.rolePermission.deleteMany({
          where: { permissionId: perm.id }
        });
        // Then delete the permission
        await Prisma.permission.delete({
          where: { id: perm.id }
        });
        console.log(`Deleted duplicate permission: ${perm.id}`);
      }
    }
  }
  
  console.log("Cleanup complete!");
}

cleanupDuplicates()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
