// @ts-nocheck
import { Elysia, t } from "elysia";
import { randomUUIDv7 } from "bun";

interface SSOResponse {
	data: {
		user: {
			role: string;
			name: string;
			username: string;
		};
	};
}

export default new Elysia().get(
	"/",
	async ({ headers, cookie: { auth } }) => {
		const authHeader = headers.authorization;

		// Validate with SSO service
		const ssoResponse = await fetch(`${process.env.SSO_URL}/users/validate`, {
			headers: {
				Authorization: authHeader,
				"Content-Type": "application/json",
			},
		});

		const response = (await ssoResponse.json()) as SSOResponse;
		console.log("Priority ssoResponse =>>", response);

		if (ssoResponse.status !== 200) {
			return "fails";
		}
		const username = response.data.user.username;

		// Find user in database
		const user = await prisma.user.findUnique({
			include: {
				HakAkses: {
					include: {
						roleRef: {},
					},
				},
			},
			where: {
				email: username, // Assuming username from SSO is email
			},
		});

		console.log("user local =>", user);

		// daftarkan user ke aplikasi jika mahasiswa
		try {
			if (!user && response.data.user.role === "mahasiswa") {
				const bcryptHash = await Bun.password.hash(
					process.env.DEFAULT_PASSWORD || "rumitpassword123",
				);
				const dataUser = {
					name: response.data.user.name,
					email: response.data.user.username,
					password: bcryptHash,
					createdAt: new Date(),
					updatedAt: new Date(),
				};
				const user = await prisma.user.create({ data: dataUser });

				console.log("user created =>", user);

				const dataMahasiswa = {
					uuid: user.uuid,
					nim: "24060123456789",
					jenjang: null,
					tahunMasuk: null,
					alamat: null,
					no_hp: null,
					id_prodi: null,
					id_departemen: null,
				};
				const statusCreateMahasiwa = await prisma.mahasiswa.create({
					data: dataMahasiswa,
				});
				console.log("statusCreateMahasiwa =>", statusCreateMahasiwa);

				const data = {
					uuid: user.uuid,
					role: ERole.PEMOHON,
					createdAt: new Date(),
				} as HakAkses;
				await prisma.hakAkses.create({ data: data });

				console.log("statusCreateHakAkses =>", data);
			}
			// dosen
			else if (!user && response.data.user.role === "dosen") {
				console.log(response.data.user.role);
				console.log("create user dosen");
				const bcryptHash = await Bun.password.hash(
					process.env.DEFAULT_PASSWORD || "rumitpassword123",
				);
				const dataUser = {
					uuid: randomUUIDv7(),
					name: response.data.user.name,
					email: response.data.user.username,
					password: bcryptHash,
					createdAt: new Date(),
					updatedAt: new Date(),
				};
				const user = await prisma.user.create({ data: dataUser });

				console.log("user created =>", user);

				// tabel user
				const dataMaPegawai = {
					uuid: user.uuid,
					nip: "24060123456789",
					id_departemen: null,
					id_prodi: null,
					no_hp: null,
					jabatan: "",
				};

				const statusCreateDosen = await prisma.pegawai.create({
					data: dataMaPegawai,
				});
				console.log("statusCreateDosen =>", statusCreateDosen);

				// tabel hak akses
				const data = {
					uuid: user.uuid,
					role: ERole.DOSEN_PEMBIMBING,
					createdAt: new Date(),
				} as HakAkses;
				await prisma.hakAkses.create({ data: data });

				console.log("statusCreateHakAkses =>", data);
			}
		} catch (error) {
			console.log("error create user mahasiswa =>", error);
		}
	},
	{
		headers: t.Object({
			authorization: t.String(),
		}),
	},
);
