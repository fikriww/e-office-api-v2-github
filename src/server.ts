import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import { createHmac } from "crypto";
import env from "env-var";

export const app = new Elysia()
	.use(swagger())
	.use(
		cors({
			origin: (request) => {
				const origin = request.headers.get("origin");
				if (!origin) return true;
				const allowedOrigins = [
					"http://localhost:3000",
					"http://localhost:8080",
					"http://10.137.58.124:3000",
					"http://10.137.58.124:8080",
					"http://10.137.58.124:20021",
					"https://apps-fsm.undip.ac.id",
					...(process.env.BETTER_AUTH_TRUSTED_ORIGINS
						? process.env.BETTER_AUTH_TRUSTED_ORIGINS.split(",").map((o) => o.trim())
						: []),
				];
				if (allowedOrigins.includes(origin)) return true;
				return false;
			},
			methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
			credentials: true,
			allowedHeaders: ["Content-Type", "Authorization", "Accept"],
			exposedHeaders: ["set-cookie", "set-auth-token"],
		}),
	)
	.use(serverTiming())
	.use(
		await autoload({
			types: {
				output: "./autogen.routes.ts",
				typeName: "App",
				useExport: true,
			},
		}),
	)
	// ─── CUSTOM HANDLER: set-session ─────────────────────────────────────────
	// Harus di-register SEBELUM .all("/api/auth/*") agar tidak ter-intercept BA.
	// Frontend SSO callback memanggil ini untuk mengubah raw token → cookie BA.
	.get("/api/auth/sso/set-session", async ({ query, set }) => {
		const token = query.token as string | undefined;
		if (!token) {
			set.status = 400;
			return { message: "Token missing" };
		}

		const session = await Prisma.session.findFirst({
			where: { token, expiresAt: { gt: new Date() } },
			include: { user: true },
		});

		if (!session) {
			set.status = 401;
			return { message: "Invalid or expired session token" };
		}

		// HMAC-sign agar format cookie kompatibel dengan Better Auth
		const secret = process.env.BETTER_AUTH_SECRET ?? "";
		const sig = createHmac("sha256", secret).update(token).digest("base64");
		const signedToken = encodeURIComponent(`${token}.${sig}`);

		const isProd = process.env.NODE_ENV === "production";
		const maxAge = Math.floor((session.expiresAt.getTime() - Date.now()) / 1000);
		const secure = isProd ? "; Secure" : "";

		set.headers["set-cookie"] =
			`better-auth.session_token=${signedToken}; HttpOnly; SameSite=Lax; Path=/${secure}; Max-Age=${maxAge}`;

		return { success: true };
	})
	// ─── CUSTOM HANDLER: get-session (inject roles) ───────────────────────────
	// Override handler bawaan BA agar response menyertakan field "roles".
	.get("/api/auth/get-session", async ({ request }) => {
		const session = await auth.api.getSession({ headers: request.headers });

		if (!session?.user) {
			return new Response(
				JSON.stringify({ session: null, user: null }),
				{ status: 401, headers: { "Content-Type": "application/json" } },
			);
		}

		const userRoles = await Prisma.userRole.findMany({
			where: { userId: session.user.id },
			include: { role: true },
		});
		const roles = userRoles.map((ur) => ur.role.name);

		return new Response(
			JSON.stringify({ ...session, user: { ...session.user, roles } }),
			{ headers: { "Content-Type": "application/json" } },
		);
	})
	// ─── Better Auth handler (semua /api/auth/* lainnya) ─────────────────────
	.all("/api/auth/*", (ctx) => {
		return auth.handler(ctx.request);
	})

export type App = typeof app;
