import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia().post(
	"/",
	async ({ body, headers }) => {
		const data = await auth.api.signUpEmail({
			body: {
				name: body.name,
				email: body.username,
				password: body.password,
				rememberMe: true,
			},
			headers: headers as Record<string, string>,
		});

		return data;
	},
	{
		body: t.Object({
			name: t.String(),
			username: t.String(),
			password: t.String(),
		}),
	},
);
