import { Elysia } from "elysia";
import { randomBytes } from "crypto";
import { Prisma } from "@backend/db/index.ts";
import { assignRoleToUser } from "@backend/lib/casbin.ts";
import env from "env-var";

export default new Elysia()

	// ─── MAIN SSO HANDLER ────────────────────────────────────────────────────
	// SSO Engine memanggil: GET /auth/sso
	// Header Authorization: <sso_token>  (kadang dengan "Bearer ", kadang tanpa)
	.get("/", async ({ request, set }) => {
		// Step 1: Ekstrak SSO token dari header Authorization
		const authHeader = request.headers.get("authorization");
		let ssoToken: string | undefined;
		if (authHeader?.startsWith("Bearer ")) {
			ssoToken = authHeader.slice(7);
		} else if (authHeader) {
			ssoToken = authHeader;
		}

		if (!ssoToken) {
			set.status = 400;
			return { message: "Token missing" };
		}

		// Step 2: Validasi token ke SSO Engine UNDIP
		const ssoHost = env.get("SSO_HOST").required().asString();
		let ssoUser: { id: string; name: string; username: string; role: string };
		try {
			const ssoRes = await fetch(`${ssoHost}/users/me`, {
				headers: { Authorization: `Bearer ${ssoToken}` },
			});
			if (!ssoRes.ok) {
				set.status = 401;
				return { message: "Invalid SSO token" };
			}
			const ssoData = await ssoRes.json() as any;
			ssoUser = ssoData.data || ssoData;
			console.log("[SSO] Data received from SSO Engine:", JSON.stringify(ssoUser));
		} catch (err) {
			console.error("[SSO] Error fetching/parsing SSO user:", err);
			set.status = 401;
			return { message: "Invalid SSO token" };
		}

		// Step 3: Ambil email dari field "username" (bukan "email"!)
		const email = ssoUser?.username;
		if (!email || typeof email !== "string") {
			console.error("[SSO] Username missing in SSO payload:", ssoUser);
			set.status = 401;
			return { message: "Invalid SSO token payload" };
		}

		console.log(`[SSO] Processing login for: ${email}, role: ${ssoUser.role}`);

		// Step 4: Cari atau buat user di database lokal
		let user = await Prisma.user.findUnique({
			where: { email },
			include: { userRole: { include: { role: true } } },
		});

		if (!user) {
			console.log(`[SSO] User ${email} not found. Creating new user...`);
			// Auto-register: buat User baru
			user = await Prisma.user.create({
				data: {
					name: ssoUser.name,
					email,
					emailVerified: true,
					isAnonymous: false,
				},
				include: { userRole: { include: { role: true } } },
			});
			console.log(`[SSO] User ${email} created with ID: ${user.id}`);
		} else {
			console.log(`[SSO] User ${email} found. ID: ${user.id}, current roles:`, user.userRole.map(ur => ur.role.name));
		}

		// Map roles if user doesn't have the expected role
		// Mapping SSO role → local role yang bisa di-auto-assign
		const SSO_ROLE_MAP: Record<string, string> = {
			mahasiswa: "mahasiswa",
			superadmin: "superadmin",
		};

		const localRoleName = SSO_ROLE_MAP[ssoUser.role];
		if (localRoleName) {
			const hasRole = user.userRole.some((ur) => ur.role.name === localRoleName);
			if (!hasRole) {
				console.log(`[SSO] Assigning role ${localRoleName} to user ${email}`);
				const localRole = await Prisma.role.findFirst({
					where: { name: localRoleName },
				});
				if (localRole) {
					await Prisma.userRole.create({
						data: { userId: user.id, roleId: localRole.id },
					});
					// Sync ke Casbin in-memory
					await assignRoleToUser(user.id, localRoleName);
					console.log(`[SSO] Role ${localRoleName} assigned successfully`);
				} else {
					console.error(`[SSO] Local role ${localRoleName} not found in database!`);
				}
			} else {
				console.log(`[SSO] User ${email} already has role ${localRoleName}`);
			}
		}

		// Reload user with roles if needed
		user = await Prisma.user.findUnique({
			where: { id: user.id },
			include: { userRole: { include: { role: true } } },
		});

		if (!user) {
			set.status = 500;
			return { message: "Gagal memproses akun" };
		}

		// Step 5: Update nama jika berubah di SSO
		if (user.name !== ssoUser.name) {
			console.log(`[SSO] Updating user name from ${user.name} to ${ssoUser.name}`);
			await Prisma.user.update({
				where: { id: user.id },
				data: { name: ssoUser.name },
			});
		}

		// Step 6: Buat session raw token — kompatibel dengan Better Auth
		// Better Auth menyimpan token sebagai raw string di tabel session.
		// Endpoint set-session akan HMAC-sign token ini agar dikenali cookie BA.
		const rawToken = randomBytes(32).toString("hex");
		const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 hari

		await Prisma.session.create({
			data: {
				id: randomBytes(16).toString("hex"),
				token: rawToken,
				userId: user.id,
				expiresAt,
				ipAddress: request.headers.get("x-forwarded-for") ?? null,
				userAgent: request.headers.get("user-agent") ?? null,
			},
		});

		// Step 7: Return callback_url relatif
		// SSO akan concat: application_url_callback + callback_url
		// = ".../persuratan-penyataan-masih-kuliah-api/auth/sso"
		//   + "/redirect?token=..."
		// = ".../persuratan-penyataan-masih-kuliah-api/auth/sso/redirect?token=..."
		// → Apache strip prefix → backend menerima: GET /auth/sso/redirect?token=...
		return {
			callback_url: `/redirect?token=${rawToken}`,
		};
	})

	// ─── REDIRECT HANDLER (Flow A) ───────────────────────────────────────────
	// Browser diarahkan ke sini oleh SSO Engine (concat hasil).
	// Kita lakukan HTTP 302 ke halaman frontend /sso/callback.
	.get("/redirect", ({ query, set }) => {
		const token = query.token as string | undefined;
		if (!token) {
			set.status = 400;
			return { message: "Token missing" };
		}

		const frontendUrl = env.get("FRONTEND_URL").required().asString();
		set.status = 302;
		set.headers["location"] = `${frontendUrl}/sso/callback?token=${encodeURIComponent(token)}`;
		return null;
	});
