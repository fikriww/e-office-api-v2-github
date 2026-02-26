import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { getUserRoles } from "@backend/lib/casbin.ts";
import { MinioService } from "@backend/services/minio.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    .post(
        "/",
        async ({ body, status, user }) => {
            try {
                const roles = await getUserRoles(user.id);
                const rawRole = roles[0] || "unknown";
                const safeRole = rawRole.replace(/[^a-zA-Z0-9_-]/g, "_");

                const rawCategory = body.category || "general";
                const safeCategory = rawCategory
                    .replace(/^\/+|\/+$/g, "")
                    .replace(/[^a-zA-Z0-9_-]/g, "_");

                const objectPrefix = `${safeCategory}/${safeRole}/${user.id}/`;

                const result = await MinioService.uploadFile(
                    body.file,
                    objectPrefix,
                    body.file.type,
                );

                return {
                    success: true,
                    data: {
                        url: `/api/public/files/${objectPrefix}${result.nameReplace}`,
                        presignedUrl: result.url,
                        filename: result.nameReplace,
                        originalName: body.file.name,
                        mimeType: body.file.type,
                        size: body.file.size,
                        objectPrefix,
                    },
                };
            } catch (err: any) {
                return status(500, { success: false, message: err.message });
            }
        },
        {
            body: t.Object({
                file: t.File(),
                category: t.Optional(t.String()), // e.g., 'lampiran', 'signature'
            }),
        },
    );
