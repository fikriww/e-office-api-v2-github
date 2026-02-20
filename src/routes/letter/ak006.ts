// AK006 routes for Mahasiswa
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006 } from "@backend/services/database_models/letterInstance.service.ts";
import { notificationService } from "@backend/services/notification.service.ts";
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
    // Identity fields
    { name: "tempat_lahir", type: "string", required: false, label: "Tempat Lahir" },
    { name: "tanggal_lahir", type: "string", required: false, label: "Tanggal Lahir" },
    { name: "no_hp", type: "string", required: false, label: "No. HP" },
    { name: "alamat", type: "string", required: false, label: "Alamat" },
    // Parent/Guardian fields
    { name: "nama_ortu_wali", type: "string", required: false, label: "Nama Orang Tua/Wali" },
    { name: "nip_pensiun_ortu_wali", type: "string", required: false, label: "NIP/Pensiunan Orang Tua/Wali" },
    { name: "golongan_ortu_wali", type: "string", required: false, label: "Golongan Orang Tua/Wali" },
    { name: "instansi_ortu_wali", type: "string", required: false, label: "Instansi Orang Tua/Wali" },
  ],
};

export default new Elysia()
  .use(authGuardPlugin)
  // Get my AK006 letters
  .get(
    "/my",
    async ({ user }) => {
      const letters = await LetterInstanceService.getByCreator(user.id, LETTER_TYPE_AK006);

      // Override status for display if this is a revision request from MTU (or higher)
      // Check if any approval step > 1 (STEP_SA) has status 'REVISION'
      const processedLetters = letters.map(letter => {
        const hasRevision = letter.approvalSteps?.some(step => step.stepNumber > 1 && step.status === 'REVISION');
        // Check if there is an active PENDING step for SA (Step 1)
        // If so, it means the student (or SA) has resubmitted/updated, so it is waiting for SA.
        const hasPendingStep1 = letter.approvalSteps?.some(step => step.stepNumber === 1 && step.status === 'PENDING');

        // Logic for returning 'Perlu Revisi' status IF it is at Supervisor step AND not actively pending review
        // If hasPendingStep1 is true, we respect the default 'PENDING' status.
        if (hasRevision && letter.currentStep === 1 && !hasPendingStep1) {
          return { ...letter, status: 'REVISION' };
        }
        return letter;
      });

      return {
        success: true,
        data: processedLetters,
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
      // Check if user is a mahasiswa and get full data
      const mahasiswa = await Prisma.mahasiswa.findUnique({
        where: { userId: user.id },
        include: {
          user: true,
          departemen: true,
          programStudi: true,
        },
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

      // Snapshot the current active template config so this letter
      // is forever rendered with the template that was active at creation time.
      let templateConfigSnapshot: object | undefined;
      const activeTemplate = await Prisma.letterTemplate.findFirst({
        where: { letterTypeId: letterType.id, isActive: true },
        orderBy: { createdAt: "desc" },
      });
      if (activeTemplate) {
        templateConfigSnapshot = activeTemplate.schemaDefinition as object;
      }

      // Create the letter
      const letter = await LetterInstanceService.create({
        letterTypeId: letterType.id,
        createdById: user.id,
        schema: AK006_SCHEMA,
        templateConfig: templateConfigSnapshot,
        values: {
          keperluan: body.keperluan,
          semester: body.semester,
          tahunAkademik: body.tahunAkademik,
          tempat_lahir: body.tempat_lahir,
          tanggal_lahir: body.tanggal_lahir,
          no_hp: body.no_hp,
          alamat: body.alamat,
          // Parent/guardian fields for AK006 letter template
          nama_ortu_wali: body.nama_ortu_wali,
          nip_pensiun_ortu_wali: body.nip_pensiun_ortu_wali,
          golongan_ortu_wali: body.golongan_ortu_wali,
          instansi_ortu_wali: body.instansi_ortu_wali,
          // Identity fields - use submitted values or fallback to mahasiswa data
          nama_lengkap: body.nama_lengkap || mahasiswa.user.name,
          nim: body.nim || mahasiswa.nim,
          email: body.email || mahasiswa.user.email,
          program_studi: body.program_studi || mahasiswa.programStudi?.name || '',
          departemen: body.departemen || mahasiswa.departemen?.name || '',
        },
        attachments: body.attachments,
      });

      // Send notification to Supervisor Akademik
      try {
        await notificationService.notifySANewLetter(
          letter.id,
          mahasiswa.user.name,
          'Surat Pernyataan Masih Kuliah'
        );
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Don't fail the request if notification fails
      }

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
        tempat_lahir: t.Optional(t.String()),
        tanggal_lahir: t.Optional(t.String()),
        no_hp: t.Optional(t.String()),
        alamat: t.Optional(t.String()),
        // Parent/guardian fields
        nama_ortu_wali: t.Optional(t.String()),
        nip_pensiun_ortu_wali: t.Optional(t.String()),
        golongan_ortu_wali: t.Optional(t.String()),
        instansi_ortu_wali: t.Optional(t.String()),
        // Identity fields that can be edited by user
        nama_lengkap: t.Optional(t.String()),
        nim: t.Optional(t.String()),
        email: t.Optional(t.String()),
        departemen: t.Optional(t.String()),
        program_studi: t.Optional(t.String()),
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

        // Check if there is a revision from MTU/UPA (Step > 1)
        // If so, and we are at Step 1, it means SA handles it, not Mahasiswa.
        const isRevisionForMahasiswa = letter.currentStep === 0;
        const isRevisionFromUpper = letter.approvalSteps?.some(step => step.stepNumber > 1 && step.status === 'REVISION');

        const newValues = {
          keperluan: body.keperluan,
          semester: body.semester,
          tahunAkademik: body.tahunAkademik,
          tempat_lahir: body.tempat_lahir,
          tanggal_lahir: body.tanggal_lahir,
          no_hp: body.no_hp,
          alamat: body.alamat,
          // Parent/guardian fields
          nama_ortu_wali: body.nama_ortu_wali,
          nip_pensiun_ortu_wali: body.nip_pensiun_ortu_wali,
          golongan_ortu_wali: body.golongan_ortu_wali,
          instansi_ortu_wali: body.instansi_ortu_wali,
          // Identity fields that can be edited
          nama_lengkap: body.nama_lengkap,
          nim: body.nim,
          email: body.email,
          departemen: body.departemen,
          program_studi: body.program_studi,
        };

        if (isRevisionForMahasiswa) {
          // Handle revision resubmission (SA/MTU requested revision TO MAHASISWA)
          const updated = await LetterInstanceService.resubmitAfterRevision(id, user.id, newValues, body.attachments, body.comments);
          return {
            success: true,
            message: "Surat berhasil diajukan ulang setelah revisi",
            data: updated,
          };
        } else if (letter.currentStep === 1 && !isRevisionFromUpper) {
          // Self-revision (mahasiswa wants to change details voluntarily before SA checks)
          // Only allowed if NO revision from upper levels exists
          const updated = await LetterInstanceService.selfRevise(id, user.id, newValues, body.attachments, body.comments);
          return {
            success: true,
            message: "Surat berhasil diperbarui",
            data: updated,
          };
        } else {
          return status(403, {
            success: false,
            message: "Anda tidak dapat mengubah data surat saat ini. Surat sedang dalam proses tinjau atau revisi di tingkat Supervisor."
          });
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
        tempat_lahir: t.Optional(t.String()),
        tanggal_lahir: t.Optional(t.String()),
        no_hp: t.Optional(t.String()),
        alamat: t.Optional(t.String()),
        // Parent/guardian fields
        nama_ortu_wali: t.Optional(t.String()),
        nip_pensiun_ortu_wali: t.Optional(t.String()),
        golongan_ortu_wali: t.Optional(t.String()),
        instansi_ortu_wali: t.Optional(t.String()),
        // Identity fields that can be edited
        nama_lengkap: t.Optional(t.String()),
        nim: t.Optional(t.String()),
        email: t.Optional(t.String()),
        departemen: t.Optional(t.String()),
        program_studi: t.Optional(t.String()),
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
        comments: t.Optional(t.String()),
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

      // Only allow cancellation if letter is still pending at step 0 (revision) or step 1 (initial submission)
      if (letter.status !== "PENDING" || (letter.currentStep !== 0 && letter.currentStep !== 1)) {
        return status(400, {
          success: false,
          message: "Surat tidak dapat dibatalkan karena sudah diproses",
        });
      }

      // Also prevent cancellation if it is currently under revision by Supervisor (requested by MTU/Upper levels)
      // If Step > 1 has revision, it means it's an internal revision process, not a fresh submission.
      const isRevisionFromUpper = letter.approvalSteps?.some(step => step.stepNumber > 1 && step.status === 'REVISION');
      if (isRevisionFromUpper) {
        return status(403, {
          success: false,
          message: "Surat tidak dapat dibatalkan karena sedang dalam proses revisi di tingkat Supervisor",
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
