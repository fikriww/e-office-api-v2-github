// AK006 routes for Supervisor Akademik (SA)
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_SA } from "@backend/services/database_models/letterInstance.service.ts";
import { notificationService } from "@backend/services/notification.service.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

export default new Elysia()
  .use(authGuardPlugin)
  // Get letters pending SA review
  .get(
    "/pending",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getPendingForStep(STEP_SA, LETTER_TYPE_AK006);

      // Override status for display if this is a revision request from MTU (or higher)
      // Check if any approval step > 1 (STEP_SA) has status 'REVISION'
      const processedLetters = letters.map(letter => {
        const hasRevision = letter.approvalSteps.some(step => step.stepNumber > STEP_SA && step.status === 'REVISION');
        // Check if there is an active PENDING step for SA (Step 1)
        // If so, it means the student (or SA) has resubmitted/updated, so it is waiting for SA.
        const hasPendingStep1 = letter.approvalSteps.some(step => step.stepNumber === STEP_SA && step.status === 'PENDING');

        if (hasRevision && !hasPendingStep1) {
          return { ...letter, status: 'REVISION' };
        }
        return letter;
      });

      return {
        success: true,
        data: processedLetters,
      };
    },
    {
      ...requireRole("supervisor_akademik"),
    }
  )
  // Get letters processed by SA (approved and moved forward)
  .get(
    "/processed",
    async ({ user, status }) => {
      const letters = await LetterInstanceService.getProcessedByStep(STEP_SA, LETTER_TYPE_AK006);
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

      // Check if revision and override status for consistency with list view
      const hasRevision = letter.approvalSteps?.some(step => step.stepNumber > STEP_SA && step.status === 'REVISION');
      if (hasRevision && letter.currentStep === STEP_SA) {
        // Clone to avoid mutation issues if any, though spread is safer
        return {
          success: true,
          data: { ...letter, status: 'REVISION' }
        };
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
        const letterTypeName = letter.letterType?.name || 'Surat Pernyataan Masih Kuliah';
        const mahasiswaName = letter.createdBy?.name || 'Mahasiswa';
        const mahasiswaId = letter.createdById;

        switch (body.action) {
          case "approve":
            result = await LetterInstanceService.approveStep(
              id,
              user.id,
              "supervisor_akademik",
              body.comments
            );

            // Send notifications
            try {
              // Notify MTU that letter needs signature
              await notificationService.notifyMTULetterVerified(
                id,
                mahasiswaName,
                letterTypeName
              );
              // Notify Mahasiswa that letter was verified
              await notificationService.notifyMahasiswaVerified(
                mahasiswaId,
                id,
                letterTypeName
              );
            } catch (notifError) {
              console.error('Failed to send notification:', notifError);
            }

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

            // Notify Mahasiswa about rejection
            try {
              await notificationService.notifyMahasiswaRejection(
                mahasiswaId,
                id,
                letterTypeName,
                body.comments,
                'Supervisor Akademik'
              );
            } catch (notifError) {
              console.error('Failed to send notification:', notifError);
            }

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

            // Notify Mahasiswa about revision request
            try {
              await notificationService.notifyMahasiswaRevision(
                mahasiswaId,
                id,
                letterTypeName,
                body.comments,
                'Supervisor Akademik'
              );
            } catch (notifError) {
              console.error('Failed to send notification:', notifError);
            }

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
  )
  // Update letter data (SA)
  .put(
    "/:id",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Check if letter is at SA step. 
      // We allow editing if it IS at SA step (PENDING or REVISION).
      if (letter.currentStep !== STEP_SA) {
        return status(400, { success: false, message: "Letter is not at SA verification step" });
      }

      try {
        const updatedLetter = await Prisma.letterInstance.update({
          where: { id },
          data: {
            values: {
              ...(typeof letter.values === 'object' && letter.values ? letter.values : {}),
              ...body
            },
            updatedAt: new Date()
          },
          include: {
            approvalSteps: true,
            letterType: true,
            createdBy: {
              include: {
                mahasiswa: {
                  include: {
                    departemen: true,
                    programStudi: true,
                  },
                },
              },
            },
          }
        });

        return {
          success: true,
          message: "Letter data updated successfully",
          data: updatedLetter,
        };
      } catch (error: any) {
        console.error("Update error:", error);
        return status(500, {
          success: false,
          message: error.message || "Failed to update letter",
        });
      }
    },
    {
      ...requireRole("supervisor_akademik"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        nama_lengkap: t.Optional(t.String()),
        nim: t.Optional(t.String()),
        email: t.Optional(t.String()),
        program_studi: t.Optional(t.String()),
        departemen: t.Optional(t.String()),
        keperluan: t.Optional(t.String()),
        semester: t.Optional(t.Union([t.String(), t.Number()])),
        tahunAkademik: t.Optional(t.String()),
        tempat_lahir: t.Optional(t.String()),
        tanggal_lahir: t.Optional(t.String()),
        no_hp: t.Optional(t.String()),
        alamat: t.Optional(t.String()),
        nama_ortu_wali: t.Optional(t.String()),
        nip_pensiun_ortu_wali: t.Optional(t.String()),
        golongan_ortu_wali: t.Optional(t.String()),
        instansi_ortu_wali: t.Optional(t.String()),
      })
    }
  )
  // Update student data (for cases like major transfer, email change, etc.)
  .put(
    "/:id/student",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Check if letter is at SA step
      if (letter.currentStep !== STEP_SA) {
        return status(400, { success: false, message: "Letter is not at SA verification step" });
      }

      const studentUserId = letter.createdById;

      try {
        // Update User data (name, email)
        if (body.name || body.email) {
          await Prisma.user.update({
            where: { id: studentUserId },
            data: {
              ...(body.name && { name: body.name }),
              ...(body.email && { email: body.email }),
              updatedAt: new Date()
            }
          });
        }

        // Update Mahasiswa data (nim, departemen, programStudi)
        if (body.nim || body.departemenId || body.programStudiId) {
          await Prisma.mahasiswa.update({
            where: { userId: studentUserId },
            data: {
              ...(body.nim && { nim: body.nim }),
              ...(body.departemenId && { departemenId: body.departemenId }),
              ...(body.programStudiId && { programStudiId: body.programStudiId }),
            }
          });
        }

        // Fetch updated letter data
        const updatedLetter = await LetterInstanceService.getById(id);

        return {
          success: true,
          message: "Student data updated successfully",
          data: updatedLetter,
        };
      } catch (error: any) {
        console.error("Update student error:", error);
        return status(500, {
          success: false,
          message: error.message || "Failed to update student data",
        });
      }
    },
    {
      ...requireRole("supervisor_akademik"),
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
        nim: t.Optional(t.String()),
        departemenId: t.Optional(t.String()),
        programStudiId: t.Optional(t.String()),
      })
    }
  );
