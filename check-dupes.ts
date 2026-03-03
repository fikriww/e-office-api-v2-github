import { PrismaClient } from "./src/generated/prisma/client";
const prisma = new PrismaClient();

async function main() {
    const softDeletedStudents = await prisma.mahasiswa.findMany({
        where: { user: { deletedAt: { not: null } } }
    });
    for (const student of softDeletedStudents) {
        if (!student.nim.startsWith('deleted_')) {
            await prisma.mahasiswa.update({
                where: { id: student.id },
                data: { nim: `deleted_${student.nim}` }
            });
            console.log(`Updated NIM for deleted student ${student.id}`);
        }
    }
}

main().finally(() => process.exit(0));
