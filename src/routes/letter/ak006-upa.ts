// AK006 routes for UPA
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_UPA } from "@backend/services/database_models/letterInstance.service.ts";
import { notificationService } from "@backend/services/notification.service.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
  .use(authGuardPlugin)
  // Get letters pending UPA numbering
  .get(
    "/pending",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getPendingForStep(STEP_UPA, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("upa"),
    }
  )
  // Get letters processed by UPA (completed)
  .get(
    "/processed",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getProcessedByStep(STEP_UPA, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("upa"),
    }
  )
  // Get archived letters
  .get(
    "/archive",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getArchivedLetters(LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {
      ...requireRole("upa"),
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
      ...requireRole("upa"),
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
      ...requireRole("upa"),
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Finalize letter (add number and archive)
  .post(
    "/:id/finalize",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_UPA) {
        return status(400, {
          success: false,
          message: "Letter is not at UPA numbering step",
        });
      }

      try {
        const result = await LetterInstanceService.finalizeLetter(
          id,
          user.id,
          {
            letterNumber: body.letterNumber,
            letterDate: body.letterDate,
            comments: body.comments,
          }
        );

        // Notify Mahasiswa that letter is completed
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        try {
          await notificationService.notifyMahasiswaCompleted(
            letter.createdById,
            id,
            letterTypeName
          );
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }

        return {
          success: true,
          message: "Letter numbered and archived successfully",
          data: result,
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to finalize letter",
        });
      }
    },
    {
      ...requireRole("upa"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        letterNumber: t.Optional(t.String()),
        letterDate: t.Optional(t.String()),
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

      if (letter.currentStep !== STEP_UPA) {
        return status(400, {
          success: false,
          message: "Letter is not at UPA step",
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
          "upa",
          body.comments
        );

        // Notify Mahasiswa about rejection
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        try {
          await notificationService.notifyMahasiswaRejection(
            letter.createdById,
            id,
            letterTypeName,
            body.comments,
            'UPA'
          );
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }

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
      ...requireRole("upa"),
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

      if (letter.currentStep !== STEP_UPA) {
        return status(400, {
          success: false,
          message: "Letter is not at UPA step",
        });
      }

      try {
        const result = await LetterInstanceService.requestRevision(
          id,
          user.id,
          "upa",
          body.comments,
          body.targetStep,
        );

        // Send notification based on target step
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        const mahasiswaName = letter.createdBy?.name || 'Mahasiswa';
        try {
          if (body.targetStep === 0) {
            // Notify Mahasiswa
            await notificationService.notifyMahasiswaRevision(
              letter.createdById,
              id,
              letterTypeName,
              body.comments,
              'UPA'
            );
          } else if (body.targetStep === 1) {
            // Notify SA
            await notificationService.notifySARevision(
              id,
              letterTypeName,
              mahasiswaName,
              body.comments
            );
          }
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }

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
      ...requireRole("upa"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        comments: t.String({ minLength: 1 }),
        targetStep: t.Number({ default: 0 }), // 0 for Mahasiswa, 1 for SA
      }),
    }
  );

