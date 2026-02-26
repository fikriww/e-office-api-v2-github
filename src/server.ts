import { cors } from "@elysiajs/cors";
import { serverTiming } from "@elysiajs/server-timing";
import { swagger } from "@elysiajs/swagger";
import { auth } from "@backend/lib/auth.ts";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
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
					"http://10.137.58.124:8080"
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
	// Mount Better Auth handler
	.all("/api/auth/*", (ctx) => {
		console.log('Better Auth route:', ctx.request.url);
		return auth.handler(ctx.request);
	})

export type App = typeof app;
