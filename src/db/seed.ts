import { Prisma } from "@backend/db/index.ts";
import { randomBytes, scryptSync } from "crypto";
import { hashPassword } from "better-auth/crypto";

import { auth } from "@backend/lib/auth.ts";

async function main() {
	console.log("Starting database seed...");

	// "pemohon"
	// "supervisor akademik"
	// "supervisor kemahasiswaan"
	// "petugas tu"
	// "dekan"
	// "wakil dekan 1"
	// "wakil dekan 2"
	// "manajer tu"
	// "petugas akademik"
	// "upa"
	// "supervisor sumberdaya"
	// "prodi"
	// "dosen pembimbing"
	// "dosen koordinator"
	// "ketua prodi"
	// "admin departemen"
	// "ketua departemen"
	// "pegawai ukt"
	// "supervisor sumberdaya"
	// "superadmin"
	// Roles
	const superAdminRole = await Prisma.role.upsert({
		create: {
			name: "superadmin",
		},
		update: {},
		where: {
			name: "superadmin",
		},
	});

	const mahasiswaRole = await Prisma.role.upsert({
		create: {
			name: "mahasiswa",
		},
		update: {},
		where: {
			name: "mahasiswa",
		},
	});

	const supervisorAkademikRole = await Prisma.role.upsert({
		create: {
			name: "supervisor_akademik",
		},
		update: {},
		where: {
			name: "supervisor_akademik",
		},
	});

	const supervisorKemahasiswaanRole = await Prisma.role.upsert({
		create: {
			name: "supervisor_kemahasiswaan",
		},
		update: {},
		where: {
			name: "supervisor_kemahasiswaan",
		},
	});

	const petugasTURole = await Prisma.role.upsert({
		create: {
			name: "petugas_tu",
		},
		update: {},
		where: {
			name: "petugas_tu",
		},
	});

	const dekanRole = await Prisma.role.upsert({
		create: {
			name: "dekan",
		},
		update: {},
		where: {
			name: "dekan",
		},
	});

	const wakilDekan1Role = await Prisma.role.upsert({
		create: {
			name: "wakil_dekan_1",
		},
		update: {},
		where: {
			name: "wakil_dekan_1",
		},
	});

	const wakilDekan2Role = await Prisma.role.upsert({
		create: {
			name: "wakil_dekan_2",
		},
		update: {},
		where: {
			name: "wakil_dekan_2",
		},
	});

	const managerTURole = await Prisma.role.upsert({
		create: {
			name: "manager_tu",
		},
		update: {},
		where: {
			name: "manager_tu",
		},
	});

	const petugasAkademikRole = await Prisma.role.upsert({
		create: {
			name: "petugas_akademik",
		},
		update: {},
		where: {
			name: "petugas_akademik",
		},
	});

	const upaRole = await Prisma.role.upsert({
		create: {
			name: "upa",
		},
		update: {},
		where: {
			name: "upa",
		},
	});

	const supervisorSumberdayaRole = await Prisma.role.upsert({
		create: {
			name: "supervisor_sumberdaya",
		},
		update: {},
		where: {
			name: "supervisor_sumberdaya",
		},
	});

	const prodiRole = await Prisma.role.upsert({
		create: {
			name: "prodi",
		},
		update: {},
		where: {
			name: "prodi",
		},
	});

	const dosenPembimbingRole = await Prisma.role.upsert({
		create: {
			name: "dosen_pembimbing",
		},
		update: {},
		where: {
			name: "dosen_pembimbing",
		},
	});

	const dosenKoordinatorRole = await Prisma.role.upsert({
		create: {
			name: "dosen_koordinator",
		},
		update: {},
		where: {
			name: "dosen_koordinator",
		},
	});

	const ketuaProdiRole = await Prisma.role.upsert({
		create: {
			name: "ketua_prodi",
		},
		update: {},
		where: {
			name: "ketua_prodi",
		},
	});

	const adminDepartemenRole = await Prisma.role.upsert({
		create: {
			name: "admin_departemen",
		},
		update: {},
		where: {
			name: "admin_departemen",
		},
	});

	const ketuaDepartemenRole = await Prisma.role.upsert({
		create: {
			name: "ketua_departemen",
		},
		update: {},
		where: {
			name: "ketua_departemen",
		},
	});

	const pegawaiUktRole = await Prisma.role.upsert({
		create: {
			name: "pegawai_ukt",
		},
		update: {},
		where: {
			name: "pegawai_ukt",
		},
	});

	console.log("User Upserted");

	// 2. Create Permissions
	const permissions = await Promise.all([
		// Departemen permission
		Prisma.permission.create({
			data: { resource: "departemen", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "departemen", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "departemen", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "departemen", action: "delete" },
		}),

		// prodi
		Prisma.permission.create({
			data: { resource: "prodi", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "prodi", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "prodi", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "prodi", action: "delete" },
		}),

		// role
		Prisma.permission.create({
			data: { resource: "role", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "role", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "role", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "role", action: "delete" },
		}),

		// user include mahasiswa and pegawai
		Prisma.permission.create({
			data: { resource: "user", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "user", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "user", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "user", action: "delete" },
		}),

		// lettertype
		Prisma.permission.create({
			data: { resource: "letterType", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "letterType", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "letterType", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "letterType", action: "delete" },
		}),

		// letter template
		Prisma.permission.create({
			data: { resource: "letterTemplate", action: "create" },
		}),
		Prisma.permission.create({
			data: { resource: "letterTemplate", action: "read" },
		}),
		Prisma.permission.create({
			data: { resource: "letterTemplate", action: "update" },
		}),
		Prisma.permission.create({
			data: { resource: "letterTemplate", action: "delete" },
		}),

		// main transaction
		Prisma.permission.create({
			data: { resource: "letter", action: "file" },
		}),
		Prisma.permission.create({
			data: { resource: "letter", action: "disposition" },
		}),
		Prisma.permission.create({
			data: { resource: "letter", action: "forward" },
		}),
		Prisma.permission.create({
			data: { resource: "letter", action: "editOverlay" },
		}),
		Prisma.permission.create({
			data: { resource: "letter", action: "numbering" },
		}),
	]);

	console.log("Permissions upserted");

	// 3. Assign Permissions to Roles
	// Admin gets all permissions
	await Promise.all(
		permissions.map((permission) =>
			Prisma.rolePermission.create({
				data: {
					roleId: superAdminRole.id,
					permissionId: permission.id,
				},
			}),
		),
	);

	// // Dosen gets letter approval permissions
	// await Promise.all(
	// 	permissions
	// 		.filter((p) =>
	// 			["letter:read", "letter:approve", "letter:reject"].includes(
	// 				`${p.resource}:${p.action}`,
	// 			),
	// 		)
	// 		.map((permission) =>
	// 			Prisma.rolePermission.create({
	// 				data: {
	// 					roleId: dosenRole.id,
	// 					permissionId: permission.id,
	// 				},
	// 			}),
	// 		),
	// );

	// Mahasiswa gets letter create and read
	await Promise.all(
		permissions
			.filter((p) =>
				["letter:create", "letter:read"].includes(`${p.resource}:${p.action}`),
			)
			.map((permission) =>
				Prisma.rolePermission.create({
					data: {
						roleId: mahasiswaRole.id,
						permissionId: permission.id,
					},
				}),
			),
	);

	console.log("Assigned permissions to roles");

	// Create Departemen
	const departemenMatematika = await Prisma.departemen.upsert({
		where: {
			code: "fsm_math",
		},
		update: {},
		create: {
			name: "Matematika",
			code: "fsm_math",
		},
	});

	const departemenBiologi = await Prisma.departemen.upsert({
		where: {
			code: "fsm_bio",
		},
		update: {},
		create: {
			name: "Biologi",
			code: "fsm_bio",
		},
	});

	const departemenKimia = await Prisma.departemen.upsert({
		where: {
			code: "fsm_kim",
		},
		update: {},
		create: {
			name: "Kimia",
			code: "fsm_kim",
		},
	});

	const departemenFisika = await Prisma.departemen.upsert({
		where: {
			code: "fsm_fis",
		},
		update: {},
		create: {
			name: "Fisika",
			code: "fsm_fis",
		},
	});

	const departemenStatistika = await Prisma.departemen.upsert({
		where: {
			code: "fsm_statis",
		},
		update: {},
		create: {
			name: "Statistika",
			code: "fsm_statis",
		},
	});

	const departemenInformatika = await Prisma.departemen.upsert({
		where: {
			code: "fsm_if",
		},
		update: {},
		create: {
			name: "Informatika",
			code: "fsm_if",
		},
	});

	const departemenFsm = await Prisma.departemen.upsert({
		where: {
			code: "fsm_main",
		},
		update: {},
		create: {
			name: "FSM",
			code: "fsm_main",
		},
	});

	// Program Studi
	const prodiInformatika = await Prisma.programStudi.upsert({
		where: {
			code: "240601",
		},
		update: {},
		create: {
			name: "S1 Informatika",
			code: "240601",
			departemenId: departemenInformatika.id,
		},
	});

	const prodiKimia = await Prisma.programStudi.upsert({
		where: {
			code: "240301",
		},
		update: {},
		create: {
			name: "S1 Kimia",
			code: "240301",
			departemenId: departemenKimia.id,
		},
	});

	const prodiFisikaS1 = await Prisma.programStudi.upsert({
		where: {
			code: "240401",
		},
		update: {},
		create: {
			name: "S1 Fisika",
			code: "240401",
			departemenId: departemenFisika.id,
		},
	});

	const prodiFisikaS2 = await Prisma.programStudi.upsert({
		where: {
			code: "240402",
		},
		update: {},
		create: {
			name: "S2 Fisika",
			code: "240402",
			departemenId: departemenFisika.id,
		},
	});

	const prodiMatematikaS1 = await Prisma.programStudi.upsert({
		where: {
			code: "240101",
		},
		update: {},
		create: {
			name: "S1 Matematika",
			code: "240101",
			departemenId: departemenMatematika.id,
		},
	});

	const prodiMatematikaS2 = await Prisma.programStudi.upsert({
		where: {
			code: "240102",
		},
		update: {},
		create: {
			name: "S2 Matematika",
			code: "240102",
			departemenId: departemenMatematika.id,
		},
	});

	const prodiStatistikaS1 = await Prisma.programStudi.upsert({
		where: {
			code: "240503",
		},
		update: {},
		create: {
			name: "S1 Statistika",
			code: "240503",
			departemenId: departemenStatistika.id,
		},
	});

	const prodiBiologiS1 = await Prisma.programStudi.upsert({
		where: {
			code: "240201",
		},
		update: {},
		create: {
			name: "S1 Biologi",
			code: "240201",
			departemenId: departemenBiologi.id,
		},
	});

	const prodiBioteknologiS1 = await Prisma.programStudi.upsert({
		where: {
			code: "240202",
		},
		update: {},
		create: {
			name: "S1 Bioteknologi",
			code: "240202",
			departemenId: departemenBiologi.id,
		},
	});

	const prodiBiologiS2 = await Prisma.programStudi.upsert({
		where: {
			code: "240203",
		},
		update: {},
		create: {
			name: "S2 Biologi",
			code: "240203",
			departemenId: departemenBiologi.id,
		},
	});

	const prodiFSM = await Prisma.programStudi.upsert({
		where: {
			code: "240111",
		},
		update: {},
		create: {
			name: "FSM",
			code: "240111",
			departemenId: departemenFsm.id,
		},
	});

	console.log("Created program studi");

	// Create Superadmin Account
	try {
		// Hash the password using Better Auth's password hashing
		const hashedPassword = await hashPassword("password1234");

		const superAdminUser = await Prisma.user.upsert({
			where: { email: "superadmin@fsm.internal" },
			update: { emailVerified: true },
			create: {
				email: "superadmin@fsm.internal",
				name: "Super Admin",
				emailVerified: true,
			},
		});

		// Upsert account with hashed password
		const existingAccount = await Prisma.account.findFirst({
			where: {
				accountId: superAdminUser.email,
				providerId: "credential",
			},
		});

		if (existingAccount) {
			await Prisma.account.update({
				where: { id: existingAccount.id },
				data: {
					password: hashedPassword,
				},
			});
		} else {
			await Prisma.account.create({
				data: {
					id: randomBytes(16).toString("hex"),
					accountId: superAdminUser.email,
					providerId: "credential",
					userId: superAdminUser.id,
					password: hashedPassword,
				},
			});
		}

		const existingRole = await Prisma.userRole.findFirst({
			where: {
				userId: superAdminUser.id,
				roleId: superAdminRole.id,
			},
		});

		if (!existingRole) {
			await Prisma.userRole.create({
				data: {
					userId: superAdminUser.id,
					roleId: superAdminRole.id,
				},
			});
		}

		console.log("✓ Created/updated superadmin user");
	} catch (error) {
		console.log("✗ Error with superadmin user:", error);
	}

	// Create demo users for each role
	type MahasiswaDemoUser = {
		email: string;
		name: string;
		roleId: string;
		type: "mahasiswa";
		additionalData: {
			nim: string;
			tahunMasuk: string;
			noHp: string;
			programStudiId: string;
			departemenId: string;
		};
	};

	type PegawaiDemoUser = {
		email: string;
		name: string;
		roleId: string;
		type: "pegawai";
		additionalData: {
			nip: string;
			jabatan: string;
			noHp: string;
			programStudiId: string;
			departemenId: string;
		};
	};

	type DemoUser = MahasiswaDemoUser | PegawaiDemoUser;

	const demoUsers: DemoUser[] = [
		{
			email: "mahasiswa@demo.local",
			name: "Mahasiswa Demo",
			roleId: mahasiswaRole.id,
			type: "mahasiswa",
			additionalData: {
				nim: "24060122000001",
				tahunMasuk: "2022",
				noHp: "081234567890",
				programStudiId: prodiInformatika.id,
				departemenId: departemenInformatika.id,
			},
		},
		{
			email: "sa@demo.local",
			name: "Supervisor Akademik",
			roleId: supervisorAkademikRole.id,
			type: "pegawai",
			additionalData: {
				nip: "198501012010121001",
				jabatan: "Supervisor Akademik",
				noHp: "081234567891",
				programStudiId: prodiInformatika.id,
				departemenId: departemenInformatika.id,
			},
		},
		{
			email: "mtu@demo.local",
			name: "Manajer TU",
			roleId: managerTURole.id,
			type: "pegawai",
			additionalData: {
				nip: "198601012011121001",
				jabatan: "Manajer Tata Usaha",
				noHp: "081234567892",
				programStudiId: prodiFSM.id,
				departemenId: departemenFsm.id,
			},
		},
		{
			email: "upa@demo.local",
			name: "UPA Demo",
			roleId: upaRole.id,
			type: "pegawai",
			additionalData: {
				nip: "198701012012121001",
				jabatan: "Unit Pelaksana Akademik",
				noHp: "081234567893",
				programStudiId: prodiFSM.id,
				departemenId: departemenFsm.id,
			},
		},
	];

	for (const demoUser of demoUsers) {
		try {
			// Hash the password using Better Auth's password hashing
			const hashedPassword = await hashPassword("password1234");

			// Upsert user
			const user = await Prisma.user.upsert({
				where: { email: demoUser.email },
				update: { emailVerified: true },
				create: {
					email: demoUser.email,
					name: demoUser.name,
					emailVerified: true,
				},
			});

			// Upsert account with hashed password
			const existingAccount = await Prisma.account.findFirst({
				where: {
					accountId: user.email,
					providerId: "credential",
				},
			});

			if (existingAccount) {
				await Prisma.account.update({
					where: { id: existingAccount.id },
					data: {
						password: hashedPassword,
					},
				});
			} else {
				await Prisma.account.create({
					data: {
						id: randomBytes(16).toString("hex"),
						accountId: user.email,
						providerId: "credential",
						userId: user.id,
						password: hashedPassword,
					},
				});
			}

			// Check if role already assigned
			const existingRole = await Prisma.userRole.findFirst({
				where: {
					userId: user.id,
					roleId: demoUser.roleId,
				},
			});

			if (!existingRole) {
				await Prisma.userRole.create({
					data: {
						userId: user.id,
						roleId: demoUser.roleId,
					},
				});
			}

			// Create or upsert mahasiswa or pegawai record
			if (demoUser.type === "mahasiswa") {
				await Prisma.mahasiswa.upsert({
					where: { userId: user.id },
					update: {
						nim: demoUser.additionalData.nim,
						tahunMasuk: demoUser.additionalData.tahunMasuk,
						noHp: demoUser.additionalData.noHp,
						programStudiId: demoUser.additionalData.programStudiId,
						departemenId: demoUser.additionalData.departemenId,
					},
					create: {
						userId: user.id,
						nim: demoUser.additionalData.nim,
						tahunMasuk: demoUser.additionalData.tahunMasuk,
						noHp: demoUser.additionalData.noHp,
						programStudiId: demoUser.additionalData.programStudiId,
						departemenId: demoUser.additionalData.departemenId,
					},
				});
			} else if (demoUser.type === "pegawai") {
				await Prisma.pegawai.upsert({
					where: { userId: user.id },
					update: {
						nip: demoUser.additionalData.nip,
						jabatan: demoUser.additionalData.jabatan,
						noHp: demoUser.additionalData.noHp,
						programStudiId: demoUser.additionalData.programStudiId,
						departemenId: demoUser.additionalData.departemenId,
					},
					create: {
						userId: user.id,
						nip: demoUser.additionalData.nip,
						jabatan: demoUser.additionalData.jabatan,
						noHp: demoUser.additionalData.noHp,
						programStudiId: demoUser.additionalData.programStudiId,
						departemenId: demoUser.additionalData.departemenId,
					},
				});
			}

			console.log(`✓ Created/updated demo user: ${demoUser.email}`);
		} catch (error) {
			console.log(`✗ User ${demoUser.email} error:`, error);
		}
	}

	console.log("Assigned roles to users");

	// Create default signature for MTU user
	try {
		const mtuUser = await Prisma.user.findUnique({
			where: { email: "mtu@demo.local" },
		});

		if (mtuUser) {
			// Check if signature already exists
			const existingSignature = await Prisma.signature.findFirst({
				where: { userId: mtuUser.id, isDefault: true },
			});

			if (!existingSignature) {
				await Prisma.signature.create({
					data: {
						userId: mtuUser.id,
						imageUrl: "/signatures/mtu-demo-signature.png",
						isDefault: true,
					},
				});
				console.log("✓ Created default signature for MTU user");
			} else {
				console.log("✓ MTU user already has a default signature");
			}
		}
	} catch (error) {
		console.log("✗ Error creating MTU signature:", error);
	}


	// Seed Letter Types
	console.log("\n--- Seeding Letter Types ---");

	const ak006LetterType = await Prisma.letterType.upsert({
		where: { id: "ak006-letter-type" },
		update: {
			name: "AK006",
			description: "Surat Pernyataan Masih Kuliah",
		},
		create: {
			id: "ak006-letter-type",
			name: "AK006",
			description: "Surat Pernyataan Masih Kuliah",
		},
	});
	console.log(`✓ Created/updated letter type: ${ak006LetterType.name}`);

	console.log("\n=== Database seeding completed! ===");
}

main()
	.catch((e) => {
		console.error("Error seeding database:", e);
		process.exit(1);
	})
	.finally(async () => {
		await Prisma.$disconnect();
	});
