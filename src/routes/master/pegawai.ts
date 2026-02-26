import { authGuardPlugin, requirePermission } from "@backend/middlewares/auth.ts";
import { PegawaiService } from "@backend/services/database_models/pegawai.service.ts";
import { UserService } from "@backend/services/database_models/user.service.ts";
import { emailService } from "@backend/services/email.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
	.use(authGuardPlugin)
	.get(
		"/all",
		async () => {
			return PegawaiService.getAll();
		},
		{
			...requirePermission("pegawai", "read"),
		},
	)
	.get(
		"/:id",
		async ({ params: { id } }) => {
			return PegawaiService.get(id);
		},
		{
			...requirePermission("pegawai", "read"),
		},
	)
	.post(
		"/",
		async ({
			body: {
				name,
				email,
				noHp,
				nip,
				jabatan,
				departemenId,
			},
		}) => {
			const user = await UserService.create({
				name: name,
				email: email,
			});

			const pegawai = await PegawaiService.create({
				userId: user.id,
				noHp: noHp,
				nip: nip,
				jabatan: jabatan,
				departemenId: departemenId,
			});

			// Send welcome email
			await emailService.sendNewUserWelcomeEmail({
				name: name,
				email: email,
				password: nip, // Default password is NIP
				userType: "pegawai",
				identifier: nip,
				jabatan,
			});

			return {
				message: "Pegawai created successfully",
				pegawai,
			};
		},
		{
			...requirePermission("pegawai", "create"),
			body: t.Object({
				name: t.String(),
				email: t.String(),
				noHp: t.String(),
				nip: t.String(),
				jabatan: t.String(),
				departemenId: t.String(),
			}),
		},
	)
	.patch(
		"/",
		async ({
			body: {
				id,
				noHp,
				nip,
				jabatan,
				departemenId,
			},
		}) => {
			const pegawai = await PegawaiService.update(id, {
				noHp: noHp,
				nip: nip,
				jabatan: jabatan,
				departemenId: departemenId,
			});

			return {
				message: "Pegawai update successfully",
				pegawai,
			};
		},
		{
			...requirePermission("pegawai", "write"),
			body: t.Object({
				id: t.String(),
				noHp: t.Optional(t.String()),
				nip: t.Optional(t.String()),
				jabatan: t.Optional(t.String()),
				departemenId: t.Optional(t.String()),
			}),
		},
	);
