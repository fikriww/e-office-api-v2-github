// AK006 routes for Manajer TU (MTU)
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_MTU } from "@backend/services/database_models/letterInstance.service.ts";
import { SignatureService } from "@backend/services/database_models/signature.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
  .use(authGuardPlugin)
  // Get letters pending MTU signature
  .get(
    "/pending",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getPendingForStep(STEP_MTU, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("manager_tu"),
    }
  )
  // Get letters processed by MTU (signed and moved forward)
  .get(
    "/processed",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getProcessedByStep(STEP_MTU, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("manager_tu"),
    }
  )
  // Get letter timeline
  .get(
    "/:id/timeline",
    async ({ params: { id }, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      const timelineData = await LetterInstanceService.getTimeline(id);

      return {
        success: true,
        data: timelineData?.timeline || [],
      };
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Get letter detail
  .get(
    "/:id",
    async ({ params: { id }, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      return {
        success: true,
        data: letter,
      };
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Sign letter
  .post(
    "/:id/sign",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_MTU) {
        return status(400, {
          success: false,
          message: "Letter is not at MTU signing step",
        });
      }

      // Get signature URL - either from request or from user's default signature
      let signatureUrl = body.signatureUrl;

      if (!signatureUrl && body.signatureId) {
        const signature = await SignatureService.getById(body.signatureId);
        if (signature && signature.userId === user.id) {
          signatureUrl = signature.imageUrl;
        }
      }

      if (!signatureUrl) {
        // Try to get default signature
        signatureUrl = await SignatureService.getDefaultSignatureUrl(user.id);
      }

      if (!signatureUrl) {
        return status(400, {
          success: false,
          message: "No signature provided and no default signature found. Please upload or select a signature.",
        });
      }

      try {
        const result = await LetterInstanceService.signLetter(
          id,
          user.id,
          signatureUrl,
          body.comments
        );

        return {
          success: true,
          message: "Letter signed and forwarded to UPA for numbering",
          data: result,
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to sign letter",
        });
      }
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        signatureId: t.Optional(t.String()),
        signatureUrl: t.Optional(t.String()),
        comments: t.Optional(t.String()),
      }),
    }
  )
  // Reject letter
  .post(
    "/:id/reject",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_MTU) {
        return status(400, {
          success: false,
          message: "Letter is not at MTU step",
        });
      }

      if (!body.comments) {
        return status(400, {
          success: false,
          message: "Comments are required when rejecting",
        });
      }

      try {
        const result = await LetterInstanceService.rejectStep(
          id,
          user.id,
          "manager_tu",
          body.comments
        );

        return {
          success: true,
          message: "Letter rejected",
          data: result,
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to reject letter",
        });
      }
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        comments: t.String({ minLength: 1 }),
      }),
    }
  )
  // Request revision
  .post(
    "/:id/revise",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_MTU) {
        return status(400, {
          success: false,
          message: "Letter is not at MTU step",
        });
      }

      try {
        const result = await LetterInstanceService.requestRevision(
          id,
          user.id,
          "manager_tu",
          body.comments,
          body.targetStep,
        );

        return {
          success: true,
          message: "Letter returned for revision",
          data: result,
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to request revision",
        });
      }
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        comments: t.String({ minLength: 1 }),
        targetStep: t.Number({ default: 0 }), // 0 for Mahasiswa, 1 for SA
      }),
    }
  );
