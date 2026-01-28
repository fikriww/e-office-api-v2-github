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
   * Generate temporary agenda number on letter creation
   * Format: [queue]/UN7.F8.4/AK/TBD/[year]
   * - queue: Sequential queue number for the year
   * - TBD: Placeholder for the final UPA number
   * - year: Current year
   */
  static async generateTemporaryAgenda(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();

    // Count all letters created in current year (including those without letterNumber)
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59);

    const count = await Prisma.letterInstance.count({
      where: {
        createdAt: {
          gte: startOfYear,
          lte: endOfYear,
        },
      },
    });

    const queueNumber = count + 1;
    const queuePadded = queueNumber.toString().padStart(3, "0");

    // Format: [queue]/UN7.F8.4/AK/TBD/[year]
    return `${queuePadded}/UN7.F8.4/AK/TBD/${year}`;
  }

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
    attachments?: Array<{
      url: string;
      filename: string;
      originalName: string;
      mimeType?: string;
      size?: number;
    }>;
  }) {
    // Generate temporary agenda number
    const temporaryAgenda = await this.generateTemporaryAgenda();

    // Create letter instance with mahasiswa submission step and first approval step (SA)
    return Prisma.letterInstance.create({
      data: {
        letterTypeId: data.letterTypeId,
        createdById: data.createdById,
        schema: data.schema,
        values: data.values,
        status: "PENDING",
        currentStep: STEP_SA,
        temporaryAgenda,
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
        attachments: data.attachments
          ? {
            create: data.attachments.map((att) => ({
              url: att.url,
              filename: att.filename,
              originalName: att.originalName,
              mimeType: att.mimeType,
              size: att.size,
            })),
          }
          : undefined,
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
        attachments: true,
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
    const timeline = [] as Array<{
      step: number;
      role: string;
      roleName: string;
      actor?: string | null;
      action: string;
      status: string;
      statusLabel: string;
      date?: Date | null;
      comments?: string | null;
      isCompleted: boolean;
      isCurrent: boolean;
      isRejected: boolean;
      isRevision: boolean;
      isFuture?: boolean;
    }>;

    const steps = letter.approvalSteps || [];

    // Step 0 entries: show all, ordered by createdAt
    const step0Entries = steps
      .filter((s) => s.stepNumber === 0)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const step of step0Entries) {
      const meta = stepMeta[0];
      let action = meta.action;
      if (step.comments?.includes("Mengubah detail")) action = "Mengubah detail surat";
      timeline.push({
        step: 0,
        role: meta.role,
        roleName: meta.roleName,
        actor: step.actor?.name || letter.createdBy?.name,
        action,
        status: step.status,
        statusLabel: statusLabels[step.status] || step.status,
        date: step.updatedAt || step.createdAt,
        comments: step.comments,
        isCompleted: step.status === "APPROVED",
        isCurrent: false,
        isRejected: step.status === "REJECTED",
        isRevision: step.status === "REVISION",
      });
    }

    // Latest entry per non-zero step (1,2,3) by updatedAt/createdAt
    const latestByStep = new Map<number, typeof steps[0]>();
    for (const s of steps.filter((x) => x.stepNumber !== 0)) {
      const key = s.stepNumber;
      const prev = latestByStep.get(key);
      const sTime = new Date(s.updatedAt || s.createdAt).getTime();
      const prevTime = prev ? new Date(prev.updatedAt || prev.createdAt).getTime() : -Infinity;
      if (!prev || sTime >= prevTime) latestByStep.set(key, s);
    }

    // Push latest for steps 1..3 or future placeholder
    const maxStep = 3; // Always only show steps 1-3 in the loop
    for (let stepNum = 1; stepNum <= maxStep; stepNum++) {
      const latest = latestByStep.get(stepNum);
      const meta = stepMeta[stepNum] || { role: `Step ${stepNum}`, roleName: "Unknown", action: "Unknown action" };
      if (latest) {
        timeline.push({
          step: stepNum,
          role: meta.role,
          roleName: meta.roleName,
          actor: latest.actor?.name || null,
          action: meta.action,
          status: latest.status,
          statusLabel: statusLabels[latest.status] || latest.status,
          date: latest.updatedAt || latest.createdAt,
          comments: latest.comments,
          isCompleted: latest.status === "APPROVED",
          isCurrent: stepNum === letter.currentStep && latest.status === "PENDING",
          isRejected: latest.status === "REJECTED",
          isRevision: latest.status === "REVISION",
        });
      } else {
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
      approvalSteps: {
        some: {
          stepNumber: stepNumber,
          status: "PENDING",
        },
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
   * Get letters that have been processed by a specific step (already approved)
   * This returns letters where currentStep > stepNumber, meaning they've passed this step
   */
  static async getProcessedByStep(stepNumber: number, letterTypeName?: string) {
    const whereClause: any = {
      OR: [
        // Letters that have moved past this step
        { currentStep: { gt: stepNumber } },
        // Letters that are completed
        { status: "COMPLETED" },
      ],
      approvalSteps: {
        some: {
          stepNumber: stepNumber,
          status: "APPROVED",
        },
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
        createdAt: "desc",
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
    return Prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.findUnique({ where: { id: letterId } });
      if (!letter) throw new Error("Letter not found");

      const currentStep = letter.currentStep;

      // Update only the PENDING step at current step number to APPROVED
      const res = await tx.letterApprovalStep.updateMany({
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

      if (res.count === 0) {
        throw new Error("No pending step to approve at current step");
      }

      // Determine next step
      const nextStep = currentStep + 1;

      if (nextStep > STEP_UPA) {
        // All steps completed
        return tx.letterInstance.update({
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
      return tx.letterInstance.update({
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
    return Prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.findUnique({ where: { id: letterId } });
      if (!letter) throw new Error("Letter not found");

      const currentStep = letter.currentStep;

      // Update only the PENDING step at current step number to REJECTED
      const res = await tx.letterApprovalStep.updateMany({
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

      if (res.count === 0) {
        throw new Error("No pending step to reject at current step");
      }

      // Update letter status to REJECTED
      return tx.letterInstance.update({
        where: { id: letterId },
        data: {
          status: "REJECTED",
          updatedAt: new Date(),
        },
        include: {
          approvalSteps: true,
        },
      });
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
    return Prisma.$transaction(async (tx) => {
      const letter = await tx.letterInstance.findUnique({ where: { id: letterId } });
      if (!letter) throw new Error("Letter not found");

      const currentStep = letter.currentStep;

      // Update only the PENDING step at current step number to REVISION
      const res = await tx.letterApprovalStep.updateMany({
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

      if (res.count === 0) {
        throw new Error("No pending step to mark as revision at current step");
      }

      // Go back to step 1 (Mahasiswa revises and resubmits)
      return tx.letterInstance.update({
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

    // Generate letter number using format: [queue]/UN7.F8.4/AK/[roman month]/[year]
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
   * Generate letter number based on format: [queue]/UN7.F8.4/AK/[roman month]/[year]
   * - queue: running number per year for this letter type (AK006)
   * - month: roman numeral of the current month
   * - year: current year (YYYY)
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

    // Pad queue to 3 digits (e.g., 001) for readability
    const queuePadded = queueNumber.toString().padStart(3, "0");

    // Format: [queue]/UN7.F8.4/AK/[month]/[year]
    return `${queuePadded}/UN7.F8.4/AK/${month}/${year}`;
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
