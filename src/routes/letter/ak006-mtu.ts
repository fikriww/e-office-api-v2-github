// AK006 routes for Manajer TU (MTU)
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_MTU } from "@backend/services/database_models/letterInstance.service.ts";
import { notificationService } from "@backend/services/notification.service.ts";
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
  // Sign letter (saves signature)
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
      let signatureUrl: string | undefined = body.signatureUrl;

      if (!signatureUrl && body.signatureId) {
        const signature = await SignatureService.getById(body.signatureId);
        if (signature && signature.userId === user.id) {
          signatureUrl = signature.imageUrl;
        }
      }

      if (!signatureUrl) {
        // Try to get default signature
        const defaultSignature = await SignatureService.getDefaultSignatureUrl(user.id);
        signatureUrl = defaultSignature || undefined;
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
          message: "Letter signed successfully (saved)",
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
  // Forward letter to UPA
  .post(
    "/:id/forward",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.currentStep !== STEP_MTU) {
        return status(400, {
          success: false,
          message: "Letter is not at MTU stage",
        });
      }

      if (!letter.signatureUrl) {
        return status(400, {
          success: false,
          message: "Letter must be signed before forwarding to UPA",
        });
      }

      try {
        const result = await LetterInstanceService.forwardToUPA(
          id,
          user.id,
          body.comments
        );

        // Send notifications
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        const mahasiswaName = letter.createdBy?.name || 'Mahasiswa';
        try {
          // Notify UPA that letter needs numbering
          await notificationService.notifyUPALetterSigned(
            id,
            mahasiswaName,
            letterTypeName
          );
          // Notify Mahasiswa that letter was signed (forwarded to UPA)
          await notificationService.notifyMahasiswaSigned(
            letter.createdById,
            id,
            letterTypeName
          );
        } catch (notifError) {
          console.error('Failed to send notification:', notifError);
        }

        return {
          success: true,
          message: "Letter forwarded to UPA for numbering",
          data: result,
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Failed to forward letter",
        });
      }
    },
    {
      ...requireRole("manager_tu"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
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

        // Notify Mahasiswa about rejection
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        try {
          await notificationService.notifyMahasiswaRejection(
            letter.createdById,
            id,
            letterTypeName,
            body.comments,
            'Manajer TU'
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
              'Manajer TU'
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
