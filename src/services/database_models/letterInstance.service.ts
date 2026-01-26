// letterInstance.service.ts
import { Prisma } from "@backend/db/index.ts";
import type { LetterStatus, ApprovalStepStatus } from "@backend/generated/prisma/client.ts";

// Letter type code for AK006 (Surat Pernyataan Masih Kuliah)
export const LETTER_TYPE_AK006 = "AK006";

// Step constants
export const STEP_SA = 1;
export const STEP_MTU = 2;
export const STEP_UPA = 3;

export abstract class LetterInstanceService {
  /**
   * Create a new letter instance with initial approval steps
   * - Step 0: Mahasiswa submission (auto-approved)
   * - Step 1: SA verification (pending)
   */
  static async create(data: {
    letterTypeId: string;
    createdById: string;
    schema: object;
    values: object;
  }) {
    // Create letter instance with mahasiswa submission step and first approval step (SA)
    return Prisma.letterInstance.create({
      data: {
        letterTypeId: data.letterTypeId,
        createdById: data.createdById,
        schema: data.schema,
        values: data.values,
        status: "PENDING",
        currentStep: STEP_SA,
        approvalSteps: {
          create: [
            {
              stepNumber: 0, // Mahasiswa submission
              status: "APPROVED",
              actorId: data.createdById,
              actorRole: "mahasiswa",
            },
            {
              stepNumber: STEP_SA, // SA verification - pending
              status: "PENDING",
            },
          ],
        },
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
      },
    });
  }

  /**
   * Get letter by ID with all relations
   */
  static async getById(id: string) {
    return Prisma.letterInstance.findUnique({
      where: { id },
      include: {
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
        archivedBy: true,
        approvalSteps: {
          include: {
            actor: true,
          },
          orderBy: {
            stepNumber: "asc",
          },
        },
      },
    });
  }

  /**
   * Get formatted timeline for a letter
   */
  static async getTimeline(letterId: string) {
    const letter = await this.getById(letterId);
    if (!letter) return null;

    // Define step metadata
    const stepMeta: Record<number, { role: string; roleName: string; action: string }> = {
      0: { role: "Mahasiswa", roleName: "Pemohon", action: "Mengajukan surat" },
      1: { role: "Supervisor Akademik", roleName: "Verifikator", action: "Memverifikasi dokumen" },
      2: { role: "Manajer TU", roleName: "Penandatangan", action: "Menandatangani surat" },
      3: { role: "UPA", roleName: "Pengarsip", action: "Penomoran & arsip" },
    };

    // Define status labels in Indonesian
    const statusLabels: Record<string, string> = {
      PENDING: "Menunggu",
      APPROVED: "Disetujui",
      REJECTED: "Ditolak",
      REVISION: "Perlu Revisi",
    };

    // Build timeline from approval steps
    const timeline = [];

    // Get all steps sorted by creation date
    const sortedSteps = [...(letter.approvalSteps || [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    // Track seen step numbers for non-mahasiswa steps (to avoid duplicates for SA/MTU/UPA)
    const seenNonZeroSteps = new Set<number>();

    for (const step of sortedSteps) {
      const stepNumber = step.stepNumber;
      
      // For step 0 (mahasiswa actions), show all entries
      // For other steps, only show the latest one per step number
      if (stepNumber !== 0 && seenNonZeroSteps.has(stepNumber)) {
        continue;
      }
      if (stepNumber !== 0) {
        seenNonZeroSteps.add(stepNumber);
      }

      const meta = stepMeta[stepNumber] || { role: `Step ${stepNumber}`, roleName: "Unknown", action: "Unknown action" };
      
      // For step 0, check if this is a revision (has comments about changing details)
      let action = meta.action;
      if (stepNumber === 0 && step.comments?.includes("Mengubah detail")) {
        action = "Mengubah detail surat";
      }
      
      timeline.push({
        step: stepNumber,
        role: meta.role,
        roleName: meta.roleName,
        actor: step.actor?.name || (stepNumber === 0 ? letter.createdBy?.name : null),
        action,
        status: step.status,
        statusLabel: statusLabels[step.status] || step.status,
        date: step.updatedAt || step.createdAt,
        comments: step.comments,
        isCompleted: step.status === "APPROVED",
        isCurrent: stepNumber === letter.currentStep && step.status === "PENDING",
        isRejected: step.status === "REJECTED",
        isRevision: step.status === "REVISION",
      });
    }

    // Add future steps that haven't been created yet
    const maxStep = letter.status === "COMPLETED" ? 4 : 3;
    for (let stepNum = 1; stepNum <= maxStep; stepNum++) {
      if (!seenNonZeroSteps.has(stepNum)) {
        const meta = stepMeta[stepNum] || { role: `Step ${stepNum}`, roleName: "Unknown", action: "Unknown action" };
        timeline.push({
          step: stepNum,
          role: meta.role,
          roleName: meta.roleName,
          actor: null,
          action: meta.action,
          status: "PENDING",
          statusLabel: "Belum Dimulai",
          date: null,
          comments: null,
          isCompleted: false,
          isCurrent: false,
          isRejected: false,
          isRevision: false,
          isFuture: true,
        });
      }
    }

    // Sort timeline: step 0 entries first (in order), then step 1, 2, 3, etc.
    // We need to preserve the chronological order while grouping
    timeline.sort((a, b) => {
      // First sort by step number
      if (a.step !== b.step) return a.step - b.step;
      // For same step number, sort by date (older first)
      if (a.date && b.date) {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      return 0;
    });

    // Add final step for completed letters
    if (letter.status === "COMPLETED") {
      timeline.push({
        step: 4,
        role: "Selesai",
        roleName: "Surat Selesai",
        actor: null,
        action: "Surat dapat diunduh",
        status: "APPROVED",
        statusLabel: "Selesai",
        date: letter.archivedAt || letter.updatedAt,
        comments: letter.letterNumber ? `Nomor Surat: ${letter.letterNumber}` : null,
        isCompleted: true,
        isCurrent: false,
        isRejected: false,
        isRevision: false,
      });
    }

    return {
      letterId: letter.id,
      letterStatus: letter.status,
      currentStep: letter.currentStep,
      timeline,
    };
  }

  /**
   * Get letters created by a user
   */
  static async getByCreator(userId: string, letterTypeCode?: string) {
    const whereClause: any = { createdById: userId };

    if (letterTypeCode) {
      whereClause.letterType = { name: letterTypeCode };
    }

    return Prisma.letterInstance.findMany({
      where: whereClause,
      include: {
        letterType: true,
        approvalSteps: {
          orderBy: {
            stepNumber: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  /**
   * Check if user has pending letter of specific type
   */
  static async hasPendingLetter(userId: string, letterTypeName: string): Promise<boolean> {
    const count = await Prisma.letterInstance.count({
      where: {
        createdById: userId,
        letterType: { name: letterTypeName },
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    });
    return count > 0;
  }

  /**
   * Get letters pending for a specific step
   */
  static async getPendingForStep(stepNumber: number, letterTypeName?: string) {
    const whereClause: any = {
      currentStep: stepNumber,
      status: {
        in: ["PENDING", "IN_PROGRESS"],
      },
    };

    if (letterTypeName) {
      whereClause.letterType = { name: letterTypeName };
    }

    return Prisma.letterInstance.findMany({
      where: whereClause,
      include: {
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
        approvalSteps: {
          orderBy: {
            stepNumber: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
  }

  /**
   * Approve current step and move to next step
   */
  static async approveStep(
    letterId: string,
    actorId: string,
    actorRole: string,
    comments?: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    const currentStep = letter.currentStep;

    // Update only the PENDING step at current step number to APPROVED
    await Prisma.letterApprovalStep.updateMany({
      where: {
        letterInstanceId: letterId,
        stepNumber: currentStep,
        status: "PENDING",
      },
      data: {
        status: "APPROVED",
        actorId,
        actorRole,
        comments,
        updatedAt: new Date(),
      },
    });

    // Determine next step
    const nextStep = currentStep + 1;

    if (nextStep > STEP_UPA) {
      // All steps completed
      return Prisma.letterInstance.update({
        where: { id: letterId },
        data: {
          status: "COMPLETED",
          updatedAt: new Date(),
        },
        include: {
          approvalSteps: true,
        },
      });
    }

    // Create next step and update letter
    return Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        currentStep: nextStep,
        status: "IN_PROGRESS",
        updatedAt: new Date(),
        approvalSteps: {
          create: {
            stepNumber: nextStep,
            status: "PENDING",
          },
        },
      },
      include: {
        approvalSteps: true,
      },
    });
  }

  /**
   * Reject letter
   */
  static async rejectStep(
    letterId: string,
    actorId: string,
    actorRole: string,
    comments: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    const currentStep = letter.currentStep;

    // Update only the PENDING step at current step number to REJECTED
    await Prisma.letterApprovalStep.updateMany({
      where: {
        letterInstanceId: letterId,
        stepNumber: currentStep,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        actorId,
        actorRole,
        comments,
        updatedAt: new Date(),
      },
    });

    // Update letter status to REJECTED
    return Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        status: "REJECTED",
        updatedAt: new Date(),
      },
      include: {
        approvalSteps: true,
      },
    });
  }

  /**
   * Request revision - send back to previous step
   */
  static async requestRevision(
    letterId: string,
    actorId: string,
    actorRole: string,
    comments: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    const currentStep = letter.currentStep;

    // Update only the PENDING step at current step number to REVISION
    await Prisma.letterApprovalStep.updateMany({
      where: {
        letterInstanceId: letterId,
        stepNumber: currentStep,
        status: "PENDING",
      },
      data: {
        status: "REVISION",
        actorId,
        actorRole,
        comments,
        updatedAt: new Date(),
      },
    });

    // Go back to step 1 (Mahasiswa revises and resubmits)
    return Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        currentStep: STEP_SA, // Back to SA step after revision
        status: "PENDING",
        updatedAt: new Date(),
        approvalSteps: {
          create: {
            stepNumber: STEP_SA,
            status: "PENDING",
          },
        },
      },
      include: {
        approvalSteps: true,
      },
    });
  }

  /**
   * Sign letter (MTU step)
   */
  static async signLetter(
    letterId: string,
    actorId: string,
    signatureUrl: string,
    comments?: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    if (letter.currentStep !== STEP_MTU) {
      throw new Error("Letter is not at MTU step");
    }

    // Update letter with signature
    await Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        signatureUrl,
        updatedAt: new Date(),
      },
    });

    // Approve the MTU step and move to UPA
    return this.approveStep(letterId, actorId, "manager_tu", comments);
  }

  /**
   * Finalize letter (UPA step) - add letter number and archive
   */
  static async finalizeLetter(
    letterId: string,
    actorId: string,
    comments?: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    if (letter.currentStep !== STEP_UPA) {
      throw new Error("Letter is not at UPA step");
    }

    // Generate letter number
    const letterNumber = await this.generateLetterNumber(letter.letterType.name);

    // Update letter with number and archive info
    await Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        letterNumber,
        archivedAt: new Date(),
        archivedById: actorId,
        updatedAt: new Date(),
      },
    });

    // Approve the UPA step (final step)
    return this.approveStep(letterId, actorId, "upa", comments);
  }

  /**
   * Generate letter number based on format: [queue]/FSM/SA/[month]/[year]
   */
  static async generateLetterNumber(letterTypeName: string): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = this.getRomanMonth(now.getMonth() + 1);

    // Count letters of this type in current year
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    const count = await Prisma.letterInstance.count({
      where: {
        letterType: { name: letterTypeName },
        letterNumber: { not: null },
        createdAt: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
    });

    const queueNumber = count + 1;

    // Format: [queue]/UN7.F8.4/AK/[month]/[year]
    return `${queueNumber}/UN7.F8.4/AK/${month}/${year}`;
  }

  /**
   * Convert month number to Roman numeral
   */
  static getRomanMonth(month: number): string {
    const romanNumerals = [
      "I", "II", "III", "IV", "V", "VI",
      "VII", "VIII", "IX", "X", "XI", "XII"
    ];
    return romanNumerals[month - 1] || "I";
  }

  /**
   * Get archived letters
   */
  static async getArchivedLetters(letterTypeName?: string) {
    const whereClause: any = {
      status: "COMPLETED",
      archivedAt: { not: null },
    };

    if (letterTypeName) {
      whereClause.letterType = { name: letterTypeName };
    }

    return Prisma.letterInstance.findMany({
      where: whereClause,
      include: {
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
        archivedBy: true,
        approvalSteps: {
          orderBy: {
            stepNumber: "asc",
          },
        },
      },
      orderBy: {
        archivedAt: "desc",
      },
    });
  }

  /**
   * Update letter values (only if still in PENDING status at SA step)
   */
  static async updateValues(letterId: string, values: object) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    if (letter.status !== "PENDING" || letter.currentStep !== STEP_SA) {
      throw new Error("Letter can only be updated when pending at SA step");
    }

    return Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        values,
        updatedAt: new Date(),
      },
      include: {
        approvalSteps: true,
      },
    });
  }

  /**
   * Resubmit letter after revision request
   * - Used when SA requested revision and mahasiswa updates the letter
   */
  static async resubmitAfterRevision(letterId: string, userId: string, values: object) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    // Verify user is the creator
    if (letter.createdById !== userId) {
      throw new Error("Access denied");
    }

    // Check if there's a REVISION step
    const revisionStep = letter.approvalSteps?.find(step => step.status === "REVISION");
    if (!revisionStep) {
      throw new Error("Letter is not in revision status");
    }

    // Update the letter values
    await Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        values,
        status: "PENDING",
        currentStep: STEP_SA,
        updatedAt: new Date(),
      },
    });

    // Find the latest pending step at SA and reset it for re-verification
    // Update any REVISION step to show it was addressed
    await Prisma.letterApprovalStep.updateMany({
      where: {
        letterInstanceId: letterId,
        status: "REVISION",
      },
      data: {
        status: "APPROVED", // Mark as addressed
        comments: revisionStep.comments ? `${revisionStep.comments} [Direvisi oleh mahasiswa]` : "[Direvisi oleh mahasiswa]",
        updatedAt: new Date(),
      },
    });

    // Create new pending step for SA re-verification
    await Prisma.letterApprovalStep.create({
      data: {
        letterInstanceId: letterId,
        stepNumber: STEP_SA,
        status: "PENDING",
      },
    });

    return this.getById(letterId);
  }

  /**
   * Self-revision: Mahasiswa voluntarily updates letter details
   * - Used when mahasiswa wants to change details before SA verifies
   * - Adds a timeline entry showing mahasiswa changed details
   */
  static async selfRevise(letterId: string, userId: string, values: object) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    // Verify user is the creator
    if (letter.createdById !== userId) {
      throw new Error("Access denied");
    }

    // Only allow self-revision when pending at SA step
    if (letter.status !== "PENDING" || letter.currentStep !== STEP_SA) {
      throw new Error("Letter can only be revised when pending at SA step");
    }

    // Update the letter values
    await Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        values,
        updatedAt: new Date(),
      },
    });

    // Add a step 0 entry to show mahasiswa revised the letter (timeline entry)
    await Prisma.letterApprovalStep.create({
      data: {
        letterInstanceId: letterId,
        stepNumber: 0, // Mahasiswa action
        status: "APPROVED",
        actorId: userId,
        actorRole: "mahasiswa",
        comments: "Mengubah detail surat",
      },
    });

    return this.getById(letterId);
  }

  /**
   * Check if letter needs revision (has REVISION status in approval steps)
   */
  static async needsRevision(letterId: string): Promise<boolean> {
    const letter = await this.getById(letterId);
    if (!letter) return false;
    return letter.approvalSteps?.some(step => step.status === "REVISION") || false;
  }

  /**
   * Delete letter instance (cancellation)
   */
  static async delete(letterId: string) {
    // Delete approval steps first (due to foreign key constraint)
    await Prisma.letterApprovalStep.deleteMany({
      where: { letterInstanceId: letterId },
    });

    // Delete the letter instance
    return Prisma.letterInstance.delete({
      where: { id: letterId },
    });
  }
}
