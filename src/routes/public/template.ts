// Public template route - any authenticated user can read templates
import { Elysia } from "elysia";
import { Prisma } from "@backend/db/index.ts";
import { getDefaultAK006Template } from "@backend/constants/default-templates.ts";

export default new Elysia()
  // GET /public/template/ak006 — no auth required
  .get("/ak006", async ({ set }) => {
    // Prevent caching so template updates are always reflected
    set.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    set.headers['Pragma'] = 'no-cache';

    // Find AK006 letter type
    const letterType = await Prisma.letterType.findFirst({
      where: { name: { contains: "AK006", mode: "insensitive" } },
    });

    if (!letterType) {
      return {
        success: true,
        data: {
          config: getDefaultAK006Template(),
        },
      };
    }

    // Find the latest active template for AK006
    const template = await Prisma.letterTemplate.findFirst({
      where: { letterTypeId: letterType.id, isActive: true },
      orderBy: { id: "desc" },
    });

    if (!template) {
      return {
        success: true,
        data: {
          config: getDefaultAK006Template(),
        },
      };
    }

    return {
      success: true,
      data: {
        config: template.schemaDefinition as Record<string, any>,
      },
    };
  });
