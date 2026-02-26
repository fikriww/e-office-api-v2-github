import { MinioService } from "@backend/services/minio.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
    .get("/*", async ({ params, set }) => {
        try {
            const path = params["*"];
            if (!path) {
                set.status = 400;
                return { success: false, message: "Path is required" };
            }

            try {
                const { stream, stat } = await MinioService.getFileStream(path);

                const headers: Record<string, string> = {
                    'cache-control': 'public, max-age=86400',
                };

                if (stat.metaData && stat.metaData['content-type']) {
                    headers['content-type'] = stat.metaData['content-type'];
                } else {
                    headers['content-type'] = 'application/octet-stream';
                }

                if (stat.size) {
                    headers['content-length'] = stat.size.toString();
                }

                return new Response(stream as any, { headers });
            } catch (err: any) {
                set.status = 404;
                return { success: false, message: "File not found" };
            }
        } catch (err: any) {
            console.error("File serving error:", err.message);
            set.status = 404;
            return { success: false, message: "File not found" };
        }
    }, {
        detail: {
            summary: "Serve files from MinIO",
            description: "Publicly accessible route to serve documents and signatures stored in MinIO",
            tags: ["Public", "Files"]
        }
    });
