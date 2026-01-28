// AK006 routes for Mahasiswa
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006 } from "@backend/services/database_models/letterInstance.service.ts";
import { Prisma } from "@backend/db/index.ts";
import { Elysia, t } from "elysia";

// AK006 Schema definition
const AK006_SCHEMA = {
  type: "AK006",
  name: "Surat Pernyataan Masih Kuliah",
  fields: [
    { name: "keperluan", type: "string", required: true, label: "Keperluan" },
    { name: "semester", type: "number", required: true, label: "Semester" },
    { name: "tahunAkademik", type: "string", required: true, label: "Tahun Akademik" },
  ],
};

export default new Elysia()
  .use(authGuardPlugin)
  // Get my AK006 letters
  .get(
    "/my",
    async ({ user }) => {
      const letters = await LetterInstanceService.getByCreator(user.id, LETTER_TYPE_AK006);
      return {
        success: true,
        data: letters,
      };
    },
    {}
  )
  // Get letter timeline
  .get(
    "/:id/timeline",
    async ({ params: { id }, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Only creator can view their own letter timeline
      if (letter.createdById !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      const timelineData = await LetterInstanceService.getTimeline(id);

      return {
        success: true,
        data: timelineData?.timeline || [],
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Get letter by ID
  .get(
    "/:id",
    async ({ params: { id }, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Only creator can view their own letter
      if (letter.createdById !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      return {
        success: true,
        data: letter,
      };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Create new AK006 request
  .post(
    "/",
    async ({ body, user, status }) => {
      // Check if user is a mahasiswa
      const mahasiswa = await Prisma.mahasiswa.findUnique({
        where: { userId: user.id },
      });

      if (!mahasiswa) {
        return status(403, {
          success: false,
          message: "Only mahasiswa can create this letter request",
        });
      }

      // Check if user already has a pending AK006
      const hasPending = await LetterInstanceService.hasPendingLetter(user.id, LETTER_TYPE_AK006);
      if (hasPending) {
        return status(400, {
          success: false,
          message: "You already have a pending AK006 request",
        });
      }

      // Get or create letter type
      let letterType = await Prisma.letterType.findFirst({
        where: { name: LETTER_TYPE_AK006 },
      });

      if (!letterType) {
        letterType = await Prisma.letterType.create({
          data: {
            name: LETTER_TYPE_AK006,
            description: "Surat Pernyataan Masih Kuliah",
          },
        });
      }

      // Create the letter
      const letter = await LetterInstanceService.create({
        letterTypeId: letterType.id,
        createdById: user.id,
        schema: AK006_SCHEMA,
        values: {
          keperluan: body.keperluan,
          semester: body.semester,
          tahunAkademik: body.tahunAkademik,
        },
        attachments: body.attachments,
      });

      return {
        success: true,
        message: "Letter request created successfully",
        data: letter,
      };
    },
    {
      body: t.Object({
        keperluan: t.String({ minLength: 1 }),
        semester: t.Number({ minimum: 1, maximum: 14 }),
        tahunAkademik: t.String({ minLength: 1 }),
        attachments: t.Optional(
          t.Array(
            t.Object({
              url: t.String(),
              filename: t.String(),
              originalName: t.String(),
              mimeType: t.Optional(t.String()),
              size: t.Optional(t.Number()),
            })
          )
        ),
      }),
    }
  )
  // Update letter (for pending at SA step OR after revision request)
  .put(
    "/:id",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.createdById !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      try {
        // Check if this is a revision resubmission (SA requested revision)
        const needsRevision = await LetterInstanceService.needsRevision(id);

        const newValues = {
          keperluan: body.keperluan,
          semester: body.semester,
          tahunAkademik: body.tahunAkademik,
        };

        let updated;
        if (needsRevision) {
          // Handle revision resubmission (SA requested revision)
          updated = await LetterInstanceService.resubmitAfterRevision(id, user.id, newValues);
          return {
            success: true,
            message: "Surat berhasil diajukan ulang setelah revisi",
            data: updated,
          };
        } else {
          // Self-revision (mahasiswa wants to change details voluntarily)
          updated = await LetterInstanceService.selfRevise(id, user.id, newValues);
          return {
            success: true,
            message: "Surat berhasil diperbarui",
            data: updated,
          };
        }
      } catch (error: any) {
        return status(400, {
          success: false,
          message: error.message || "Failed to update letter",
        });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      body: t.Object({
        keperluan: t.String({ minLength: 1 }),
        semester: t.Number({ minimum: 1, maximum: 14 }),
        tahunAkademik: t.String({ minLength: 1 }),
      }),
    }
  )
  // Cancel/delete letter (only if pending at step 1)
  .delete(
    "/:id",
    async ({ params: { id }, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Only creator can cancel their own letter
      if (letter.createdById !== user.id) {
        return status(403, { success: false, message: "Access denied" });
      }

      // Only allow cancellation if letter is still pending at step 1
      if (letter.status !== "PENDING" || letter.currentStep !== 1) {
        return status(400, {
          success: false,
          message: "Surat tidak dapat dibatalkan karena sudah diproses",
        });
      }

      try {
        await LetterInstanceService.delete(id);

        return {
          success: true,
          message: "Pengajuan surat berhasil dibatalkan",
        };
      } catch (error: any) {
        return status(500, {
          success: false,
          message: error.message || "Gagal membatalkan surat",
        });
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
    }
  )
  // Get schema info
  .get(
    "/schema",
    () => {
      return {
        success: true,
        data: AK006_SCHEMA,
      };
    },
    {}
  );
