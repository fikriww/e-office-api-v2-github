// AK006 routes for Supervisor Akademik (SA)
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_SA } from "@backend/services/database_models/letterInstance.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
  .use(authGuardPlugin)
  // Get letters pending SA review
  .get(
    "/pending",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getPendingForStep(STEP_SA, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("supervisor_akademik"),
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
      ...requireRole("supervisor_akademik"),
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
      ...requireRole("supervisor_akademik"),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Verify letter (approve, reject, or request revision)
  .post(
    "/:id/verify",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_SA) {
        return status(400, {
          success: false,
          message: "Letter is not at SA verification step",
        });
      }

      try {
        let result;
        switch (body.action) {
          case "approve":
            result = await LetterInstanceService.approveStep(
              id,
              user.id,
              "supervisor_akademik",
              body.comments
            );
            return {
              success: true,
              message: "Letter verified and forwarded to MTU for signing",
              data: result,
            };

          case "reject":
            if (!body.comments) {
              return status(400, {
                success: false,
                message: "Comments are required when rejecting",
              });
            }
            result = await LetterInstanceService.rejectStep(
              id,
              user.id,
              "supervisor_akademik",
              body.comments
            );
            return {
              success: true,
              message: "Letter rejected",
              data: result,
            };

          case "revision":
            if (!body.comments) {
              return status(400, {
                success: false,
                message: "Comments are required when requesting revision",
              });
            }
            result = await LetterInstanceService.requestRevision(
              id,
              user.id,
              "supervisor_akademik",
              body.comments
            );
            return {
              success: true,
              message: "Revision requested, letter returned to student",
              data: result,
            };

          default:
            return status(400, {
              success: false,
              message: "Invalid action. Use: approve, reject, or revision",
            });
        }
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to verify letter",
        });
      }
    },
    {
      ...requireRole("supervisor_akademik"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        action: t.Union([
          t.Literal("approve"),
          t.Literal("reject"),
          t.Literal("revision"),
        ]),
        comments: t.Optional(t.String()),
      }),
    }
  );
