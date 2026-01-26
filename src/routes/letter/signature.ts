// Signature management routes for MTU
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { SignatureService } from "@backend/services/database_models/signature.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
  .use(authGuardPlugin)
  // Get my signatures
  .get(
    "/my",
    async ({ user }) => {
      const signatures = await SignatureService.getByUser(user.id);
      return {
        success: true,
        data: signatures,
      };
    },
    {
      ...requireRole("manager_tu"),
    }
  )
  // Upload/create new signature
  .post(
    "/",
    async ({ body, user }) => {
      const signature = await SignatureService.create({
        userId: user.id,
        imageUrl: body.imageUrl,
        isDefault: body.isDefault ?? false,
      });

      return {
        success: true,
        message: "Signature saved successfully",
        data: signature,
      };
    },
    {
      ...requireRole("manager_tu"),
      body: t.Object({
        imageUrl: t.String({ minLength: 1 }),
        isDefault: t.Optional(t.Boolean()),
      }),
    }
  )
  // Set signature as default
  .post(
    "/:id/default",
    async ({ params: { id }, user, status }) => {
      const signature = await SignatureService.getById(id);

      if (!signature) {
        return status(404, { success: false, message: "Signature not found" });
      }

      if (signature.userId !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      const updated = await SignatureService.setDefault(id, user.id);

      return {
        success: true,
        message: "Default signature updated",
        data: updated,
      };
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Delete signature
  .delete(
    "/:id",
    async ({ params: { id }, user, status }) => {
      const signature = await SignatureService.getById(id);

      if (!signature) {
        return status(404, { success: false, message: "Signature not found" });
      }

      if (signature.userId !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      await SignatureService.delete(id);

      return {
        success: true,
        message: "Signature deleted",
      };
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
    }
  );
