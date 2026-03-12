// dont use any @ import for this file, better auth is picky
import { PrismaClient } from "@backend/db/index.ts";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { anonymous, bearer, jwt } from "better-auth/plugins";

const prisma = new PrismaClient();
export const auth = betterAuth({
	// database: prismaAdapter(Prisma, {
	// 	provider: "postgresql",
	// }),
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	experimental: {
		joins: true,
	},
	emailAndPassword: {
		enabled: true,
	},
	basePath: "/api/auth",
	trustedOrigins: [
		"http://localhost:3000",
		"http://localhost:3001",
		"http://127.0.0.1:3000",
		"http://127.0.0.1:3001",
		...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
			? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
			: []),
	],
	plugins: [
		anonymous(),
		bearer(),
		//jwt()
	],
});
