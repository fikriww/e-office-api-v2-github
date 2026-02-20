import { auth } from "@backend/lib/auth.ts";
import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia().post(
	"/",
	async ({ body, headers }) => {
		const data = await auth.api.signInEmail({
			body: {
				email: body.username, // required
				password: body.password, // required
				rememberMe: true,
			},
			// This endpoint requires session cookies.
			headers: headers as Record<string, string>,
		});

		return data;
	},
	{
		body: t.Object({
			username: t.String(),
			password: t.String(),
		}),
	},
);
