// @ts-nocheck
// letterInstance.service.ts
import { Prisma } from "@backend/db/index.ts";
import type { LetterStatus, ApprovalStepStatus } from "@backend/generated/prisma/client.ts";
import { Prisma as PrismaNamespace } from "@backend/generated/prisma/client.ts";
import { getDefaultAK006Template } from "@backend/constants/default-templates.ts";

// Letter type code for AK006 (Surat Pernyataan Masih Kuliah)
export const LETTER_TYPE_AK006 = "AK006";

// Step constants
export const STEP_SA = 1;
export const STEP_MTU = 2;
export const STEP_UPA = 3;

export abstract class LetterInstanceService {
  /**
   * Ensure a letter instance has templateConfig filled in.
   * For letters created before template versioning, templateConfig is null.
   *
   * Logic:
   * - If the letter was created BEFORE the oldest DB template, use the
   *   hardcoded default (that was the active template at creation time).
   * - Otherwise pick the oldest DB template (the one that was active when
   *   the letter was created).
   *
   * Also persists the backfill to the database so it only happens once.
   */
  static async ensureTemplateConfig<T extends { id: string; createdAt?: Date | string | null; templateConfig?: any; letterTypeId?: string; letterType?: { id: string } | null }>(
    letter: T | null
  ): Promise<T | null> {
    if (!letter) return null;
    if (letter.templateConfig != null) return letter;

    const letterTypeId = letter.letterTypeId || letter.letterType?.id;
    if (!letterTypeId) return letter;

    // Find the OLDEST template for this letter type
    const oldestTemplate = await Prisma.letterTemplate.findFirst({
      where: { letterTypeId },
      orderBy: { createdAt: "asc" },
    });

    let config: any;

    if (!oldestTemplate) {
      // No templates in DB at all — use hardcoded default
      config = getDefaultAK006Template();
    } else {
      // Compare letter creation time with oldest template creation time
      const letterDate = letter.createdAt ? new Date(letter.createdAt) : null;
      const templateDate = new Date(oldestTemplate.createdAt);

      if (letterDate && letterDate < templateDate) {
        // Letter was created BEFORE any template existed — use hardcoded default
        config = getDefaultAK006Template();
      } else {
        // Letter was created after templates existed — use the oldest template
        config = oldestTemplate.schemaDefinition;
      }
    }

    // Persist the backfill so this query doesn't repeat
    await Prisma.letterInstance.update({
      where: { id: letter.id },
      data: { templateConfig: config },
    }).catch(() => { /* ignore if update fails */ });

    return { ...letter, templateConfig: config };
  }

  /**
   * Ensure templateConfig for an array of letter instances
   */
  static async ensureTemplateConfigMany<T extends { id: string; templateConfig?: any; letterTypeId?: string; letterType?: { id: string } | null }>(
    letters: T[]
  ): Promise<T[]> {
    return Promise.all(letters.map(l => this.ensureTemplateConfig(l) as Promise<T>));
  }

  /**
   * Bulk backfill all existing letters that don't have templateConfig.
   * - Letters created BEFORE the oldest DB template get the hardcoded defaults.
   * - Letters created AFTER get the oldest DB template's config.
   * Returns count of letters updated.
   */
  static async backfillAllTemplateConfigs(): Promise<number> {
    // Get all letter types that have templates
    const letterTypes = await Prisma.letterType.findMany({
      include: {
        templates: {
          orderBy: { createdAt: "asc" },
          take: 1, // oldest template
        },
      },
    });

    let totalUpdated = 0;
    const defaultConfig = getDefaultAK006Template();

    for (const lt of letterTypes) {
      if (lt.templates.length === 0) {
        // No templates exist at all — backfill everything with hardcoded default
        const result = await Prisma.letterInstance.updateMany({
          where: {
            letterTypeId: lt.id,
            templateConfig: { equals: PrismaNamespace.DbNull },
          },
          data: {
            templateConfig: defaultConfig,
          },
        });
        totalUpdated += result.count;
        continue;
      }

      const oldestTemplate = lt.templates[0];
      const oldestConfig = oldestTemplate.schemaDefinition as any;
      const oldestDate = oldestTemplate.createdAt;

      // 1) Letters created BEFORE the oldest template → hardcoded defaults
      const beforeResult = await Prisma.letterInstance.updateMany({
        where: {
          letterTypeId: lt.id,
          templateConfig: { equals: PrismaNamespace.DbNull },
          createdAt: { lt: oldestDate },
        },
        data: {
          templateConfig: defaultConfig,
        },
      });
      totalUpdated += beforeResult.count;

      // 2) Letters created AFTER the oldest template → oldest template config
      const afterResult = await Prisma.letterInstance.updateMany({
        where: {
          letterTypeId: lt.id,
          templateConfig: { equals: PrismaNamespace.DbNull },
          createdAt: { gte: oldestDate },
        },
        data: {
          templateConfig: oldestConfig,
        },
      });
      totalUpdated += afterResult.count;
    }

    return totalUpdated;
  }

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
    templateConfig?: object;
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
        templateConfig: data.templateConfig || undefined,
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
   * Automatically backfills templateConfig for letters created before versioning.
   */
  static async getById(id: string) {
    const letter = await Prisma.letterInstance.findUnique({
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

    return this.ensureTemplateConfig(letter);
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
      SUBMITTED: "Diajukan",
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
      // For Mahasiswa (step 0), always show "Diajukan" as status label
      timeline.push({
        step: 0,
        role: meta.role,
        roleName: meta.roleName,
        actor: step.actor?.name || letter.createdBy?.name,
        action,
        status: step.status,
        statusLabel: "Diajukan",
        date: step.updatedAt || step.createdAt,
        comments: step.comments,
        isCompleted: step.status === "APPROVED",
        isCurrent: false,
        isRejected: step.status === "REJECTED",
        isRevision: step.status === "REVISION",
      });
    }

    // Get all non-zero step entries, sorted by date
    const nonZeroSteps = steps
      .filter((s) => s.stepNumber !== 0)
      // Filter out redundant PENDING steps:
      // Only show PENDING status if it matches the letter's currentStep.
      // This prevents "Waiting" entries from appearing for steps that are in REVISION state (since currentStep would be 0).
      .filter((s) => {
        if (s.status === 'PENDING') {
          return s.stepNumber === letter.currentStep;
        }
        return true;
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    // Track which step numbers have entries
    const stepsWithEntries = new Set(nonZeroSteps.map(s => s.stepNumber));

    // Add all non-zero step entries (including revisions)
    for (const step of nonZeroSteps) {
      const meta = stepMeta[step.stepNumber] || { role: `Step ${step.stepNumber}`, roleName: "Unknown", action: "Unknown action" };

      // Determine action based on status
      let action = meta.action;
      if (step.status === "REVISION") {
        action = "Meminta revisi";
      } else if (step.status === "REJECTED") {
        action = "Menolak surat";
      } else if (step.status === "APPROVED") {
        action = step.stepNumber === 1 ? "Menyetujui surat" :
          step.stepNumber === 2 ? "Menandatangani surat" :
            step.stepNumber === 3 ? "Menerbitkan surat" : meta.action;
      }

      timeline.push({
        step: step.stepNumber,
        role: meta.role,
        roleName: meta.roleName,
        actor: step.actor?.name || null,
        action,
        status: step.status,
        statusLabel: statusLabels[step.status] || step.status,
        date: step.updatedAt || step.createdAt,
        comments: step.comments,
        isCompleted: step.status === "APPROVED",
        isCurrent: step.stepNumber === letter.currentStep && step.status === "PENDING",
        isRejected: step.status === "REJECTED",
        isRevision: step.status === "REVISION",
      });
    }

    // Add future placeholders for steps that haven't started yet
    const maxStep = 3;
    for (let stepNum = 1; stepNum <= maxStep; stepNum++) {
      if (!stepsWithEntries.has(stepNum)) {
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

    // Sort timeline chronologically by date
    // Order: completed/rejected/revision entries by date -> current PENDING step -> future entries
    timeline.sort((a, b) => {
      // Future entries go at the end
      if (a.isFuture && !b.isFuture) return 1;
      if (!a.isFuture && b.isFuture) return -1;
      // Both are future - sort by step number
      if (a.isFuture && b.isFuture) return a.step - b.step;

      // Current PENDING step should come after all completed/rejected/revision entries
      // but before future entries
      if (a.isCurrent && !b.isCurrent && !b.isFuture) return 1;
      if (!a.isCurrent && b.isCurrent && !a.isFuture) return -1;

      // Both have dates - sort chronologically
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateA - dateB;
    });

    // Add final step for completed letters
    if (letter.status === "COMPLETED") {
      // Get the last UPA approval step date, or use archivedAt/updatedAt
      const upaStep = steps.find(s => s.stepNumber === 3 && s.status === "APPROVED");
      const completedDate = upaStep?.updatedAt || upaStep?.createdAt || letter.archivedAt || letter.updatedAt;

      timeline.push({
        step: 4,
        role: "Selesai",
        roleName: "Surat Selesai",
        actor: null,
        action: "Surat dapat diunduh",
        status: "APPROVED",
        statusLabel: "Selesai",
        date: completedDate,
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
   * Automatically backfills templateConfig for letters created before versioning.
   */
  static async getByCreator(userId: string, letterTypeCode?: string) {
    const whereClause: any = { createdById: userId };

    if (letterTypeCode) {
      whereClause.letterType = { name: letterTypeCode };
    }

    const letters = await Prisma.letterInstance.findMany({
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

    return this.ensureTemplateConfigMany(letters);
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

    const letters = await Prisma.letterInstance.findMany({
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

    return this.ensureTemplateConfigMany(letters);
  }

  /**
   * Get letters that have been processed by a specific step (already approved)
   * This returns letters where currentStep > stepNumber, meaning they've passed this step
   */
  static async getProcessedByStep(stepNumber: number, letterTypeName?: string) {
    const whereClause: any = {
      approvalSteps: {
        some: {
          stepNumber: stepNumber,
          status: {
            in: ["APPROVED", "REJECTED", "REVISION"]
          }
        }
      }
    };

    if (letterTypeName) {
      whereClause.letterType = { name: letterTypeName };
    }

    const letters = await Prisma.letterInstance.findMany({
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

    return this.ensureTemplateConfigMany(letters);
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
            approvalSteps: {
              include: {
                actor: true,
              },
              orderBy: {
                stepNumber: "asc",
              },
            },
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
            attachments: true,
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
          approvalSteps: {
            include: {
              actor: true,
            },
            orderBy: {
              stepNumber: "asc",
            },
          },
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
          attachments: true,
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
          approvalSteps: {
            include: {
              actor: true,
            },
            orderBy: {
              stepNumber: "asc",
            },
          },
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
          attachments: true,
        },
      });
    });
  }

  /**
   * Request revision - send back to Mahasiswa to fix
   */
  /**
   * Request revision - send back to Mahasiswa or previous step
   */
  static async requestRevision(
    letterId: string,
    actorId: string,
    actorRole: string,
    comments: string,
    targetStep: number = 0 // Default revisions go back to Mahasiswa
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
          // Store target step info if needed? Ideally we should add a revisionTargetStep field to approvalStep schema but for now we rely on comments or implicit flow
          // Assuming approvalStep doesn't have revisionTargetStep column yet based on previous files seen.
          updatedAt: new Date(),
        },
      });

      if (res.count === 0) {
        throw new Error("No pending step to mark as revision at current step");
      }

      // If resolving back to SA (step 1), we need to ensure SA step is Pending?
      // Actually, if we send back to SA (step 1), we should create a new PENDING step for step 1?
      // OR just set currentStep to 1 and ensure there is a PENDING step for 1? 

      // If we send to Mahasiswa (step 0), we set currentStep 0 and status PENDING.

      // Let's implement generic logic:
      // Set currentStep to targetStep.
      // If targetStep is NOT 0, recreate a PENDING step for that target step so they can act on it?
      // But if targetStep is 0 (Mahasiswa), they don't have a PENDING approval step usually (only SA and up do).
      // Mahasiswa status is tracked by letter.currentStep === 0.

      // However, if we send back to SA (1), we probably want to create a new PENDING step for 1?
      // Logic for resubmitAfterRevision (Mahasiswa) creates PENDING for SA.
      // If MTU sends back to SA, we should probably create PENDING for SA.

      const updateData: any = {
        currentStep: targetStep,
        status: "PENDING",
        updatedAt: new Date(),
      };

      if (targetStep > 0) {
        // If returning to a supervisor/admin step, we need to create a new PENDING entry for them to approve again
        updateData.approvalSteps = {
          create: {
            stepNumber: targetStep,
            status: "PENDING"
          }
        };
      }

      return tx.letterInstance.update({
        where: { id: letterId },
        data: updateData,
        include: {
          approvalSteps: {
            include: {
              actor: true,
            },
            orderBy: {
              stepNumber: "asc",
            },
          },
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
          attachments: true,
        },
      });
    });
  }

  /**
   * Sign letter (MTU step) - only saves signature, doesn't advance step
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
    return Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        signatureUrl,
        updatedAt: new Date(),
      },
      include: {
        approvalSteps: true,
        letterType: true,
        createdBy: true
      }
    });
  }

  /**
   * Forward letter to UPA (after MTU signature)
   */
  static async forwardToUPA(
    letterId: string,
    actorId: string,
    comments?: string
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    if (letter.currentStep !== STEP_MTU) {
      throw new Error("Letter is not at MTU step");
    }

    if (!letter.signatureUrl) {
      throw new Error("Letter must be signed before forwarding to UPA");
    }

    // Approve the MTU step and move to UPA
    return this.approveStep(letterId, actorId, "manager_tu", comments);
  }

  /**
   * Finalize letter (UPA step) - add letter number and archive
   */
  static async finalizeLetter(
    letterId: string,
    actorId: string,
    data?: { letterNumber?: string; letterDate?: string; comments?: string }
  ) {
    const letter = await this.getById(letterId);
    if (!letter) throw new Error("Letter not found");

    if (letter.currentStep !== STEP_UPA) {
      throw new Error("Letter is not at UPA step");
    }

    // Use provided letter number or generate automatically
    const letterNumber = data?.letterNumber || await this.generateLetterNumber(letter.letterType.name);

    // Parse letterDate if provided, otherwise use current date
    let archivedAt = new Date();
    if (data?.letterDate) {
      const parsedDate = new Date(data.letterDate);
      if (!isNaN(parsedDate.getTime())) {
        archivedAt = parsedDate;
      }
    }

    // Update letter with number and archive info
    await Prisma.letterInstance.update({
      where: { id: letterId },
      data: {
        letterNumber,
        archivedAt,
        archivedById: actorId,
        updatedAt: new Date(),
      },
    });

    // Approve the UPA step (final step)
    return this.approveStep(letterId, actorId, "upa", data?.comments);
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

    const letters = await Prisma.letterInstance.findMany({
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

    return this.ensureTemplateConfigMany(letters);
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
  static async resubmitAfterRevision(letterId: string, userId: string, values: object, attachments?: any[], comments?: string) {
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

    // If attachments are provided, delete old attachments and create new ones
    if (attachments && attachments.length > 0) {
      // Delete old attachments
      await Prisma.attachment.deleteMany({
        where: { letterInstanceId: letterId }
      });

      // Create new attachments
      await Prisma.attachment.createMany({
        data: attachments.map(att => ({
          url: att.url,
          filename: att.filename,
          originalName: att.originalName,
          mimeType: att.mimeType,
          size: att.size,
          letterInstanceId: letterId,
        }))
      });
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

    // Add step 0 entry to record that mahasiswa resubmitted after revision
    await Prisma.letterApprovalStep.create({
      data: {
        letterInstanceId: letterId,
        stepNumber: 0, // Mahasiswa step
        status: "APPROVED",
        actorId: userId,
        actorRole: "mahasiswa",
        comments: comments !== undefined ? comments : `Mengajukan ulang setelah revisi dari ${revisionStep.actorRole === 'supervisor_akademik' ? 'Supervisor Akademik' : revisionStep.actorRole === 'manager_tu' ? 'Manajer TU' : 'pihak terkait'}`,
      },
    });

    // Update any REVISION step to show it was addressed (if needed, or just leave it as history)
    // We create new pending step for SA re-verification
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
  static async selfRevise(letterId: string, userId: string, values: object, attachments?: any[], comments?: string) {
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

    // If attachments are provided, delete old attachments and create new ones
    if (attachments && attachments.length > 0) {
      // Delete old attachments
      await Prisma.attachment.deleteMany({
        where: { letterInstanceId: letterId }
      });

      // Create new attachments
      await Prisma.attachment.createMany({
        data: attachments.map(att => ({
          url: att.url,
          filename: att.filename,
          originalName: att.originalName,
          mimeType: att.mimeType,
          size: att.size,
          letterInstanceId: letterId,
        }))
      });
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
        comments: comments !== undefined ? comments : "Mengubah detail surat",
      },
    });

    // Update existing PENDING SA step to show change detected, then create new PENDING step
    // This ensures timeline shows: Mahasiswa update -> SA needs to verify again
    const existingSAStep = letter.approvalSteps?.find(
      s => s.stepNumber === STEP_SA && s.status === "PENDING"
    );

    if (existingSAStep) {
      // Mark existing SA step as "updated" (we'll keep it PENDING but update timestamp)
      // This is so the timeline shows that SA verification is still needed after the change
      await Prisma.letterApprovalStep.update({
        where: { id: existingSAStep.id },
        data: {
          updatedAt: new Date(),
        },
      });
    }

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
