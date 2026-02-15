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
					headers,
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
