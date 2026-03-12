import { auth } from "@backend/lib/auth.ts";
import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { getUserRoles } from "@backend/lib/casbin.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia().use(authGuardPlugin).get(
	"/",
	async ({ user }) => {
		console.log(user);

		// Fetch the user's roles
		const roles = await getUserRoles(user.id);

		// Fetch full user data with mahasiswa relations
		const fullUser = await Prisma.user.findUnique({
			where: { id: user.id },
			include: {
				mahasiswa: {
					include: {
						departemen: true,
						programStudi: true,
					},
				},
				pegawai: {
					include: {
						departemen: true,
						programStudi: true,
					},
				},
			},
		});

		return {
			success: true,
			data: {
				...user,
				roles,
				mahasiswa: fullUser?.mahasiswa,
				pegawai: fullUser?.pegawai,
			},
		};
	},
	{},
)
	.patch(
		"/complete-profile",
		async ({ user, body, set }) => {
			const userWithRole = await Prisma.user.findUnique({
				where: { id: user.id },
				include: { userRole: { include: { role: true } } },
			});

			if (!userWithRole) {
				set.status = 404;
				return { success: false, message: "User tidak ditemukan" };
			}

			const roles = userWithRole.userRole.map((ur) => ur.role.name);

			if (roles.includes("mahasiswa")) {
				const { nim, tahunMasuk, noHp, alamat, tempatLahir, tanggalLahir, departemenId, programStudiId } = body;
				if (!nim || !tahunMasuk || !noHp || !departemenId || !programStudiId) {
					set.status = 400;
					return {
						success: false,
						message: "nim, tahunMasuk, noHp, departemenId, programStudiId wajib diisi",
					};
				}
				const existing = await Prisma.mahasiswa.findUnique({ where: { userId: user.id } });
				if (existing) {
					set.status = 409;
					return { success: false, message: "Profil mahasiswa sudah ada" };
				}
				await Prisma.mahasiswa.create({
					data: {
						userId: user.id,
						nim,
						tahunMasuk,
						noHp,
						alamat: alamat ?? null,
						tempatLahir: tempatLahir ?? null,
						tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
						departemenId,
						programStudiId,
					},
				});
				return { success: true, message: "Profil berhasil dilengkapi" };
			}

			const pegawaiRoles = ["supervisor_akademik", "manajer_tu", "upa", "superadmin"];
			if (roles.some((r) => pegawaiRoles.includes(r))) {
				const { nip, jabatan, noHp, departemenId, programStudiId } = body;
				if (!nip || !jabatan || !departemenId || !programStudiId) {
					set.status = 400;
					return {
						success: false,
						message: "nip, jabatan, departemenId, programStudiId wajib diisi",
					};
				}
				const existing = await Prisma.pegawai.findUnique({ where: { userId: user.id } });
				if (existing) {
					set.status = 409;
					return { success: false, message: "Profil pegawai sudah ada" };
				}
				await Prisma.pegawai.create({
					data: {
						userId: user.id,
						nip,
						jabatan,
						noHp: noHp ?? null,
						departemenId,
						programStudiId,
					},
				});
				return { success: true, message: "Profil berhasil dilengkapi" };
			}

			set.status = 400;
			return { success: false, message: "Role tidak memerlukan kelengkapan profil" };
		},
		{
			body: t.Object({
				nim: t.Optional(t.String()),
				tahunMasuk: t.Optional(t.String()),
				nip: t.Optional(t.String()),
				jabatan: t.Optional(t.String()),
				noHp: t.Optional(t.String()),
				alamat: t.Optional(t.String()),
				tempatLahir: t.Optional(t.String()),
				tanggalLahir: t.Optional(t.String()),
				departemenId: t.String(),
				programStudiId: t.String(),
			}),
		},
	)
	.post(
		"/password",
		async ({ body, headers }) => {
			const { currentPassword, newPassword } = body;
			try {
				const data = await auth.api.changePassword({
					body: {
						currentPassword,
						newPassword,
						revokeOtherSessions: true,
					},
					headers: headers as Record<string, string>,
				});
				return {
					success: true,
					data,
				};
			} catch (error: any) {
				console.error("Change password error:", error);
				return {
					success: false,
					message: error.body?.message || error.message || "Failed to change password",
				};
			}
		},
		{
			body: t.Object({
				currentPassword: t.String(),
				newPassword: t.String(),
			}),
		},
	);
