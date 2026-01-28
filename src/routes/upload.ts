import { authGuardPlugin } from "@backend/middlewares/auth.ts";
import { MinioService } from "@backend/services/minio.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .use(authGuardPlugin)
    .post(
        "/",
        async ({ body, status }) => {
            try {
                const result = await MinioService.uploadFile(
                    body.file,
                    body.category || "general/",
                    body.file.type // Pass content type
                );

                return {
                    success: true,
                    data: {
                        url: result.url,
                        filename: result.nameReplace,
                        originalName: body.file.name,
                        mimeType: body.file.type,
                        size: body.file.size
                    },
                };
            } catch (err: any) {
                return status(500, { success: false, message: err.message });
            }
        },
        {
            body: t.Object({
                file: t.File(),
                category: t.Optional(t.String()), // e.g., 'lampiran/', 'signature/'
            }),
        }
    );
