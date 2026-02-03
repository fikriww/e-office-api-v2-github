// Public document verification route - no authentication required
import { Elysia, t } from "elysia";
import { Prisma } from "@backend/db/index.ts";

/**
 * SECURITY NOTES:
 * 
 * 1. UUID-based IDs: The system uses CUIDs (Collision-resistant Unique Identifiers)
 *    which are cryptographically random and cannot be guessed sequentially.
 *    Example: "clzj3k4x50000356abc7de9fg" vs sequential "1", "2", "3"
 * 
 * 2. Limited Data Exposure: Only essential verification data is returned.
 *    Sensitive fields like full addresses, phone numbers, or internal IDs are excluded.
 * 
 * 3. Rate Limiting (recommended): Consider implementing rate limiting to prevent
 *    brute-force attempts to discover valid document IDs.
 * 
 * 4. Audit Logging: Each verification request can be logged for security monitoring.
 */

interface TimelineStep {
  stepNumber: number;
  status: string;
  actorName: string;
  actorRole: string;
  comments: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface VerificationResponse {
  success: boolean;
  data?: {
    // Document info
    documentId: string;
    letterNumber: string | null;
    letterType: string;
    status: string;
    createdAt: string;
    completedAt: string | null;
    
    // Student info (limited for privacy)
    studentName: string;
    studentNim: string;
    programStudi: string;
    departemen: string;
    
    // Timeline/Riwayat Proses
    timeline: TimelineStep[];
    
    // Verification metadata
    verifiedAt: string;
    isValid: boolean;
  };
  message?: string;
}

export default new Elysia()
  // Public verification endpoint - no auth required
  .get(
    "/:documentId",
    async ({ params: { documentId }, set }): Promise<VerificationResponse> => {
      try {
        // Fetch letter instance with related data
        const letter = await Prisma.letterInstance.findUnique({
          where: { id: documentId },
          include: {
            letterType: true,
            createdBy: {
              include: {
                mahasiswa: {
                  include: {
                    programStudi: true,
                    departemen: true,
                  },
                },
              },
            },
            approvalSteps: {
              orderBy: { stepNumber: "asc" },
              include: {
                actor: true,
              },
            },
          },
        });

        // Document not found
        if (!letter) {
          set.status = 404;
          return {
            success: false,
            message: "Dokumen tidak ditemukan. Pastikan URL yang Anda akses benar.",
          };
        }

        // Check if document is completed/valid (has been through approval process)
        const isCompleted = letter.status === "COMPLETED";
        const hasLetterNumber = !!letter.letterNumber;
        const isValid = isCompleted && hasLetterNumber;

        // Get student info
        const mahasiswa = letter.createdBy?.mahasiswa;
        const studentName = letter.createdBy?.name || "N/A";
        const studentNim = mahasiswa?.nim || "N/A";
        const programStudi = mahasiswa?.programStudi?.name || "N/A";
        const departemen = mahasiswa?.departemen?.name || "N/A";

        // Get completion date from archived date or last approval step
        const completedAt = letter.archivedAt?.toISOString() || null;

        // Build timeline from approval steps
        const timeline: TimelineStep[] = letter.approvalSteps.map((step) => ({
          stepNumber: step.stepNumber,
          status: step.status,
          actorName: step.actor?.name || "Unknown",
          actorRole: step.actorRole || "Unknown",
          comments: step.comments,
          createdAt: step.createdAt.toISOString(),
          updatedAt: step.updatedAt?.toISOString() || null,
        }));

        return {
          success: true,
          data: {
            documentId: letter.id,
            letterNumber: letter.letterNumber,
            letterType: letter.letterType?.name || "Surat",
            status: letter.status,
            createdAt: letter.createdAt.toISOString(),
            completedAt,
            studentName,
            studentNim,
            programStudi,
            departemen,
            timeline,
            verifiedAt: new Date().toISOString(),
            isValid,
          },
        };
      } catch (error) {
        console.error("Verification error:", error);
        set.status = 500;
        return {
          success: false,
          message: "Terjadi kesalahan saat memverifikasi dokumen.",
        };
      }
    },
    {
      params: t.Object({
        documentId: t.String({
          description: "The unique document ID (CUID format)",
          examples: ["clzj3k4x50000356abc7de9fg"],
        }),
      }),
      detail: {
        summary: "Verify Document Authenticity",
        description: "Public endpoint to verify document authenticity via QR code scan",
        tags: ["Verification"],
      },
    }
  );
