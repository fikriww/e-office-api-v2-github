// Public reference data route — any authenticated user can read departemen & prodi lists
import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";

export default new Elysia()
    // GET /public/reference/departemen — list all departemen
    .get("/departemen", async () => {
        const departemen = await Prisma.departemen.findMany({
            where: { deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
        });
        return { success: true, data: departemen };
    })

    // GET /public/reference/prodi — list program studi, optionally filtered by departemenId
    .get(
        "/prodi",
        async ({ query }) => {
            const where: any = { deletedAt: null };
            if (query.departemenId) {
                where.departemenId = query.departemenId;
            }
            const prodi = await Prisma.programStudi.findMany({
                where,
                orderBy: { name: "asc" },
                select: { id: true, name: true, code: true, departemenId: true },
            });
            return { success: true, data: prodi };
        },
        {
            query: t.Object({
                departemenId: t.Optional(t.String()),
            }),
        }
    );
