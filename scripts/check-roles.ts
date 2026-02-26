
import { Prisma } from '../src/db/index.ts';

async function main() {
    console.log('--- Checking for inconsistent users ---');

    // Find users with mahasiswa record but no userRole record
    const inconsistentMahasiswa = await Prisma.user.findMany({
        where: {
            mahasiswa: { isNot: null },
            userRole: { none: {} },
            deletedAt: null
        },
        include: {
            mahasiswa: true
        }
    });

    console.log(`Found ${inconsistentMahasiswa.length} mahasiswa with missing DB roles.`);
    inconsistentMahasiswa.forEach(u => {
        console.log(`- User: ${u.name} (${u.email}), NIM: ${u.mahasiswa?.nim}`);
    });

    // Find users with pegawai record but no userRole record
    const inconsistentPegawai = await Prisma.user.findMany({
        where: {
            pegawai: { isNot: null },
            userRole: { none: {} },
            deletedAt: null
        },
        include: {
            pegawai: true
        }
    });

    console.log(`Found ${inconsistentPegawai.length} pegawai with missing DB roles.`);
    inconsistentPegawai.forEach(u => {
        console.log(`- User: ${u.name} (${u.email}), NIP: ${u.pegawai?.nip}, Jabatan: ${u.pegawai?.jabatan}`);
    });

    if (process.argv.includes('--fix')) {
        console.log('\n--- Fixing inconsistent users ---');

        // Fix Mahasiswa
        const mahasiswaRole = await Prisma.role.findUnique({ where: { name: 'mahasiswa' } });
        if (mahasiswaRole) {
            for (const u of inconsistentMahasiswa) {
                await Prisma.userRole.create({
                    data: { userId: u.id, roleId: mahasiswaRole.id }
                });
                console.log(`Fixed role for mahasiswa: ${u.name}`);
            }
        }

        // Fix Pegawai (harder as role name is dynamic, but we can guess or leave for manual check)
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await Prisma.$disconnect();
    });
