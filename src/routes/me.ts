import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { getUserRoles } from "@backend/lib/casbin.ts";
import { Elysia } from "elysia";

export default new Elysia().use(authGuardPlugin).get(
	"/",
	async ({ user }) => {
		console.log(user);
		
		// Fetch the user's roles
		const roles = await getUserRoles(user.id);
		
		return {
			...user,
			roles,
		};
	},
	{},
);
