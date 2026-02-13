// Superadmin routes for full system oversight
import { authGuardPlugin, requireRole } from "@backend/middlewares/auth.ts";
import { LetterInstanceService, LETTER_TYPE_AK006, STEP_SA, STEP_MTU, STEP_UPA } from "@backend/services/database_models/letterInstance.service.ts";
import { notificationService } from "@backend/services/notification.service.ts";
import { Prisma } from "@backend/db/index.ts";
import { getUserRoles, assignRoleToUser, removeRoleFromUser } from "@backend/lib/casbin.ts";
import { getDefaultAK006Template } from "@backend/constants/default-templates.ts";
import { hashPassword } from "better-auth/crypto";
import { randomBytes } from "crypto";
import { Elysia, t } from "elysia";

const SUPERADMIN_ROLE = "superadmin";

// Include pattern for full letter data
const letterInclude = {
  letterType: true,
  createdBy: {
    include: {
      mahasiswa: {
        include: {
          departemen: true,
          programStudi: true,
        },
      },
      pegawai: {
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
      stepNumber: "asc" as const,
    },
  },
};

// Include pattern for full user data
const userInclude = {
  mahasiswa: {
    include: {
      departemen: true,
      programStudi: true,
    },
  },
  pegawai: {
    include: {
      departemen: true,
      programStudi: true,
    },
  },
  userRole: {
    include: {
      role: true,
    },
  },
};

export default new Elysia()
  .use(authGuardPlugin)

  // ==================== DASHBOARD STATISTICS ====================

  // Get system-wide statistics
  .get(
    "/stats",
    async ({ user, status }) => {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Get letter statistics
      const [totalLetters, pendingLetters, completedLetters, rejectedLetters, inProgressLetters] = await Promise.all([
        Prisma.letterInstance.count(),
        Prisma.letterInstance.count({ where: { status: "PENDING" } }),
        Prisma.letterInstance.count({ where: { status: "COMPLETED" } }),
        Prisma.letterInstance.count({ where: { status: "REJECTED" } }),
        Prisma.letterInstance.count({ where: { status: "IN_PROGRESS" } }),
      ]);

      // Monthly statistics
      const [monthlyTotal, monthlyCompleted, monthlyPending] = await Promise.all([
        Prisma.letterInstance.count({
          where: { createdAt: { gte: startOfMonth, lte: endOfMonth } },
        }),
        Prisma.letterInstance.count({
          where: { status: "COMPLETED", createdAt: { gte: startOfMonth, lte: endOfMonth } },
        }),
        Prisma.letterInstance.count({
          where: { status: "PENDING", createdAt: { gte: startOfMonth, lte: endOfMonth } },
        }),
      ]);

      // User statistics
      const [totalUsers, totalMahasiswa, totalPegawai] = await Promise.all([
        Prisma.user.count({ where: { deletedAt: null } }),
        Prisma.mahasiswa.count({ where: { user: { deletedAt: null } } }),
        Prisma.pegawai.count({ where: { user: { deletedAt: null } } }),
      ]);

      // Letters by step/role
      const lettersByStep = {
        mahasiswaStep: await Prisma.letterInstance.count({ where: { currentStep: 0 } }),
        saStep: await Prisma.letterInstance.count({ where: { currentStep: STEP_SA, status: { not: "COMPLETED" } } }),
        mtuStep: await Prisma.letterInstance.count({ where: { currentStep: STEP_MTU, status: { not: "COMPLETED" } } }),
        upaStep: await Prisma.letterInstance.count({ where: { currentStep: STEP_UPA, status: { not: "COMPLETED" } } }),
      };

      return {
        success: true,
        data: {
          letters: {
            total: totalLetters,
            pending: pendingLetters,
            completed: completedLetters,
            rejected: rejectedLetters,
            inProgress: inProgressLetters,
            byStep: lettersByStep,
          },
          monthly: {
            total: monthlyTotal,
            completed: monthlyCompleted,
            pending: monthlyPending,
          },
          users: {
            total: totalUsers,
            mahasiswa: totalMahasiswa,
            pegawai: totalPegawai,
          },
        },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
    }
  )

  // ==================== ALL LETTERS MANAGEMENT ====================

  // Get all letters with filtering
  .get(
    "/letters",
    async ({ query, status }) => {
      const { page = "1", limit = "20", status: statusFilter, role, dateFrom, dateTo, search } = query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = {};

      if (statusFilter && statusFilter !== "all") {
        where.status = statusFilter;
      }

      if (role) {
        switch (role) {
          case "mahasiswa":
            where.currentStep = 0;
            break;
          case "supervisor_akademik":
            where.currentStep = STEP_SA;
            break;
          case "manager_tu":
            where.currentStep = STEP_MTU;
            break;
          case "upa":
            where.currentStep = STEP_UPA;
            break;
        }
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) where.createdAt.gte = new Date(dateFrom);
        if (dateTo) where.createdAt.lte = new Date(dateTo + "T23:59:59");
      }

      if (search) {
        where.OR = [
          { letterNumber: { contains: search, mode: "insensitive" } },
          { temporaryAgenda: { contains: search, mode: "insensitive" } },
          { createdBy: { name: { contains: search, mode: "insensitive" } } },
          { createdBy: { email: { contains: search, mode: "insensitive" } } },
        ];
      }

      const [rawLetters, total] = await Promise.all([
        Prisma.letterInstance.findMany({
          where,
          include: letterInclude,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        Prisma.letterInstance.count({ where }),
      ]);

      // Ensure templateConfig is backfilled for old letters
      const letters = await LetterInstanceService.ensureTemplateConfigMany(rawLetters);

      return {
        success: true,
        data: letters,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        status: t.Optional(t.String()),
        role: t.Optional(t.String()),
        dateFrom: t.Optional(t.String()),
        dateTo: t.Optional(t.String()),
        search: t.Optional(t.String()),
      }),
    }
  )

  // Get single letter detail
  .get(
    "/letters/:id",
    async ({ params: { id }, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      return { success: true, data: letter };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
    }
  )

  // Get letter timeline
  .get(
    "/letters/:id/timeline",
    async ({ params: { id }, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      const timelineData = await LetterInstanceService.getTimeline(id);

      return { success: true, data: timelineData?.timeline || [] };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
    }
  )

  // Update letter data (superadmin edit)
  .put(
    "/letters/:id",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      const updateData: any = {};

      if (body.values) {
        updateData.values = {
          ...(letter.values as object),
          ...body.values,
        };
      }

      if (body.status) {
        updateData.status = body.status;
      }

      if (body.currentStep !== undefined) {
        updateData.currentStep = body.currentStep;
      }

      if (body.letterNumber) {
        updateData.letterNumber = body.letterNumber;
      }

      const updatedLetter = await Prisma.letterInstance.update({
        where: { id },
        data: updateData,
        include: letterInclude,
      });

      return {
        success: true,
        message: "Letter updated successfully",
        data: updatedLetter,
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        values: t.Optional(t.Any()),
        status: t.Optional(t.String()),
        currentStep: t.Optional(t.Number()),
        letterNumber: t.Optional(t.String()),
      }),
    }
  )

  // Force approve letter (skip to completion)
  .post(
    "/letters/:id/force-approve",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.status === "COMPLETED") {
        return status(400, { success: false, message: "Letter is already completed" });
      }

      // Mark all pending steps as approved and complete the letter
      await Prisma.$transaction(async (tx) => {
        // Update all pending approval steps to APPROVED
        await tx.letterApprovalStep.updateMany({
          where: {
            letterInstanceId: id,
            status: "PENDING",
          },
          data: {
            status: "APPROVED",
            actorId: user.id,
            actorRole: "superadmin",
            comments: body.comments || "Force approved by Superadmin",
          },
        });

        // Create any missing approval steps
        const existingSteps = await tx.letterApprovalStep.findMany({
          where: { letterInstanceId: id },
          select: { stepNumber: true },
        });
        const existingStepNumbers = existingSteps.map((s) => s.stepNumber);

        const missingSteps = [STEP_SA, STEP_MTU, STEP_UPA].filter(
          (step) => !existingStepNumbers.includes(step)
        );

        for (const step of missingSteps) {
          await tx.letterApprovalStep.create({
            data: {
              letterInstanceId: id,
              stepNumber: step,
              status: "APPROVED",
              actorId: user.id,
              actorRole: "superadmin",
              comments: "Force approved by Superadmin",
            },
          });
        }

        // Update letter instance
        await tx.letterInstance.update({
          where: { id },
          data: {
            status: "COMPLETED",
            currentStep: STEP_UPA,
            letterNumber: body.letterNumber || letter.letterNumber || letter.temporaryAgenda,
            archivedAt: new Date(),
            archivedById: user.id,
          },
        });
      });

      const updatedLetter = await LetterInstanceService.getById(id);

      // Notify the letter creator
      try {
        await notificationService.notifyMahasiswaCompleted(
          letter.createdById,
          id,
          letter.letterType?.name || "Letter"
        );
      } catch (notifError) {
        console.error("Failed to send notification:", notifError);
      }

      return {
        success: true,
        message: "Letter force approved and completed",
        data: updatedLetter,
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        comments: t.Optional(t.String()),
        letterNumber: t.Optional(t.String()),
      }),
    }
  )

  // Force reject letter
  .post(
    "/letters/:id/force-reject",
    async ({ params: { id }, body, user, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      if (letter.status === "COMPLETED") {
        return status(400, { success: false, message: "Cannot reject a completed letter" });
      }

      if (!body.comments) {
        return status(400, { success: false, message: "Rejection reason is required" });
      }

      // Update the current approval step to REJECTED
      await Prisma.$transaction(async (tx) => {
        // Find current pending step or create one
        const currentStep = await tx.letterApprovalStep.findFirst({
          where: { letterInstanceId: id, status: "PENDING" },
        });

        if (currentStep) {
          await tx.letterApprovalStep.update({
            where: { id: currentStep.id },
            data: {
              status: "REJECTED",
              actorId: user.id,
              actorRole: "superadmin",
              comments: body.comments,
            },
          });
        } else {
          // Create a rejection step
          await tx.letterApprovalStep.create({
            data: {
              letterInstanceId: id,
              stepNumber: letter.currentStep,
              status: "REJECTED",
              actorId: user.id,
              actorRole: "superadmin",
              comments: body.comments,
            },
          });
        }

        // Update letter status
        await tx.letterInstance.update({
          where: { id },
          data: { status: "REJECTED" },
        });
      });

      const updatedLetter = await LetterInstanceService.getById(id);

      // Notify the letter creator
      try {
        await notificationService.notifyMahasiswaRejection(
          letter.createdById,
          id,
          letter.letterType?.name || "Letter",
          body.comments,
          "Superadmin"
        );
      } catch (notifError) {
        console.error("Failed to send notification:", notifError);
      }

      return {
        success: true,
        message: "Letter rejected by superadmin",
        data: updatedLetter,
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        comments: t.String(),
      }),
    }
  )

  // Delete letter
  .delete(
    "/letters/:id",
    async ({ params: { id }, status }) => {
      const letter = await LetterInstanceService.getById(id);

      if (!letter) {
        return status(404, { success: false, message: "Letter not found" });
      }

      // Delete letter and related data
      await Prisma.$transaction(async (tx) => {
        // Delete approval steps first
        await tx.letterApprovalStep.deleteMany({
          where: { letterInstanceId: id },
        });
        // Delete attachments
        await tx.attachment.deleteMany({
          where: { letterInstanceId: id },
        });
        // Delete notifications related to this letter
        await tx.notification.deleteMany({
          where: { letterInstanceId: id },
        });
        // Delete the letter
        await tx.letterInstance.delete({
          where: { id },
        });
      });

      return {
        success: true,
        message: "Letter deleted successfully",
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
    }
  )

  // ==================== USER MANAGEMENT ====================

  // Get all users
  .get(
    "/users",
    async ({ query, status }) => {
      const { page = "1", limit = "20", role, search, type } = query;
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build where clause
      const where: any = { deletedAt: null };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
        ];
      }

      if (type === "mahasiswa") {
        where.mahasiswa = { isNot: null };
      } else if (type === "pegawai") {
        where.pegawai = { isNot: null };
      }

      const [users, total] = await Promise.all([
        Prisma.user.findMany({
          where,
          include: userInclude,
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        Prisma.user.count({ where }),
      ]);

      // Get roles for each user from Casbin
      const usersWithRoles = await Promise.all(
        users.map(async (user: any) => {
          const roles = await getUserRoles(user.id);
          return {
            ...user,
            roles,
          };
        })
      );

      return {
        success: true,
        data: usersWithRoles,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      query: t.Object({
        page: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        role: t.Optional(t.String()),
        search: t.Optional(t.String()),
        type: t.Optional(t.String()),
      }),
    }
  )

  // Get single user detail
  .get(
    "/users/:id",
    async ({ params: { id }, status }) => {
      const user = await Prisma.user.findUnique({
        where: { id },
        include: userInclude,
      });

      if (!user) {
        return status(404, { success: false, message: "User not found" });
      }

      const roles = await getUserRoles(id);

      return {
        success: true,
        data: { ...user, roles },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
    }
  )

  // Update user
  .put(
    "/users/:id",
    async ({ params: { id }, body, status }) => {
      const user = await Prisma.user.findUnique({ where: { id } });

      if (!user) {
        return status(404, { success: false, message: "User not found" });
      }

      const updateData: any = {};
      if (body.name) updateData.name = body.name;
      if (body.email) updateData.email = body.email;

      const updatedUser = await Prisma.user.update({
        where: { id },
        data: updateData,
        include: userInclude,
      });

      const roles = await getUserRoles(id);

      return {
        success: true,
        message: "User updated successfully",
        data: { ...updatedUser, roles },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
    }
  )

  // Assign role to user
  .post(
    "/users/:id/roles",
    async ({ params: { id }, body, status }) => {
      const user = await Prisma.user.findUnique({ where: { id } });

      if (!user) {
        return status(404, { success: false, message: "User not found" });
      }

      // Check if role exists in database
      const role = await Prisma.role.findUnique({ where: { name: body.role } });
      if (!role) {
        return status(400, { success: false, message: `Role '${body.role}' does not exist` });
      }

      // Check if user already has this role
      const existingUserRole = await Prisma.userRole.findFirst({
        where: { userId: id, roleId: role.id },
      });

      if (existingUserRole) {
        return status(400, { success: false, message: "User already has this role" });
      }

      // Add role in database
      await Prisma.userRole.create({
        data: {
          userId: id,
          roleId: role.id,
        },
      });

      // Add role in Casbin
      await assignRoleToUser(id, body.role);

      const roles = await getUserRoles(id);

      return {
        success: true,
        message: `Role '${body.role}' assigned successfully`,
        data: { roles },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
      body: t.Object({
        role: t.String(),
      }),
    }
  )

  // Remove role from user
  .delete(
    "/users/:id/roles/:roleName",
    async ({ params: { id, roleName }, status }) => {
      const user = await Prisma.user.findUnique({ where: { id } });

      if (!user) {
        return status(404, { success: false, message: "User not found" });
      }

      // Find role
      const role = await Prisma.role.findUnique({ where: { name: roleName } });
      if (!role) {
        return status(400, { success: false, message: `Role '${roleName}' does not exist` });
      }

      // Remove role from database
      await Prisma.userRole.deleteMany({
        where: { userId: id, roleId: role.id },
      });

      // Remove role from Casbin
      await removeRoleFromUser(id, roleName);

      const roles = await getUserRoles(id);

      return {
        success: true,
        message: `Role '${roleName}' removed successfully`,
        data: { roles },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String(), roleName: t.String() }),
    }
  )

  // Delete user (soft delete)
  .delete(
    "/users/:id",
    async ({ params: { id }, user, status }) => {
      // Prevent self-deletion
      if (id === user.id) {
        return status(400, { success: false, message: "Cannot delete your own account" });
      }

      const targetUser = await Prisma.user.findUnique({ where: { id } });

      if (!targetUser) {
        return status(404, { success: false, message: "User not found" });
      }

      // Soft delete user
      await Prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      return {
        success: true,
        message: "User deleted successfully",
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ id: t.String() }),
    }
  )

  // Create mahasiswa user (user + mahasiswa record + role assignment)
  .post(
    "/users/mahasiswa",
    async ({ body, status }) => {
      // Check if email already exists
      const existingUser = await Prisma.user.findUnique({
        where: { email: body.email },
      });
      if (existingUser) {
        return status(400, {
          success: false,
          message: "Email sudah terdaftar",
        });
      }

      // Validate departemen exists
      const dept = await Prisma.departemen.findUnique({ where: { id: body.departemenId } });
      if (!dept) {
        return status(400, { success: false, message: "Departemen tidak ditemukan" });
      }

      // Validate prodi exists
      const prodi = await Prisma.programStudi.findUnique({ where: { id: body.programStudiId } });
      if (!prodi) {
        return status(400, { success: false, message: "Program studi tidak ditemukan" });
      }

      // Validate password
      if (!body.password || body.password.length < 8) {
        return status(400, { success: false, message: "Password minimal 8 karakter" });
      }

      // Create user
      const user = await Prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          emailVerified: false,
          isAnonymous: false,
        },
      });

      // Create credential account with hashed password
      const hashedPw = await hashPassword(body.password);
      await Prisma.account.create({
        data: {
          id: randomBytes(16).toString("hex"),
          accountId: user.email,
          providerId: "credential",
          userId: user.id,
          password: hashedPw,
        },
      });

      // Create mahasiswa record
      await Prisma.mahasiswa.create({
        data: {
          userId: user.id,
          nim: body.nim,
          tahunMasuk: body.tahunMasuk,
          noHp: body.noHp,
          alamat: body.alamat || null,
          tempatLahir: body.tempatLahir || null,
          tanggalLahir: body.tanggalLahir ? new Date(body.tanggalLahir) : null,
          departemenId: body.departemenId,
          programStudiId: body.programStudiId,
        },
      });

      // Assign mahasiswa role
      const mahasiswaRole = await Prisma.role.findUnique({ where: { name: "mahasiswa" } });
      if (mahasiswaRole) {
        await assignRoleToUser(user.id, "mahasiswa");
      }

      // Return full user data
      const fullUser = await Prisma.user.findUnique({
        where: { id: user.id },
        include: userInclude,
      });
      const roles = await getUserRoles(user.id);

      return {
        success: true,
        message: "Mahasiswa berhasil ditambahkan",
        data: { ...fullUser, roles },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      body: t.Object({
        name: t.String(),
        email: t.String(),
        password: t.String(),
        nim: t.String(),
        tahunMasuk: t.String(),
        noHp: t.String(),
        alamat: t.Optional(t.String()),
        tempatLahir: t.Optional(t.String()),
        tanggalLahir: t.Optional(t.String()),
        departemenId: t.String(),
        programStudiId: t.String(),
      }),
    }
  )

  // Get all departemen (for dropdowns)
  .get(
    "/departemen",
    async () => {
      const departemen = await Prisma.departemen.findMany({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
      });
      return { success: true, data: departemen };
    },
    { ...requireRole(SUPERADMIN_ROLE) }
  )

  // Get program studi (optionally filtered by departemenId)
  .get(
    "/prodi",
    async ({ query }) => {
      const where: any = { deletedAt: null };
      if (query.departemenId) {
        where.departemenId = query.departemenId;
      }
      const prodi = await Prisma.programStudi.findMany({
        where,
        orderBy: { name: "asc" },
      });
      return { success: true, data: prodi };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      query: t.Object({
        departemenId: t.Optional(t.String()),
      }),
    }
  )

  // ==================== ROLE MANAGEMENT ====================

  // Get all roles
  .get(
    "/roles",
    async ({ status }) => {
      const roles = await Prisma.role.findMany({
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
          _count: {
            select: { users: true },
          },
        },
        orderBy: { name: "asc" },
      });

      return {
        success: true,
        data: roles,
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
    }
  )

  // ==================== IMPERSONATION ====================

  // Generate impersonation token
  .post(
    "/impersonate/:userId",
    async ({ params: { userId }, user, status }) => {
      const targetUser = await Prisma.user.findUnique({
        where: { id: userId },
        include: userInclude,
      });

      if (!targetUser) {
        return status(404, { success: false, message: "User not found" });
      }

      const roles = await getUserRoles(userId);

      // Return user data for frontend to handle impersonation display
      // Note: Actual session impersonation would require more complex implementation
      // This provides the data needed for the frontend to display user's view
      return {
        success: true,
        data: {
          user: { ...targetUser, roles },
          impersonatedBy: {
            id: user.id,
            name: user.name,
          },
        },
        message: `You are now viewing the system as ${targetUser.name}`,
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      params: t.Object({ userId: t.String() }),
    }
  )

  // ==================== TEMPLATE BACKFILL ====================

  // Backfill templateConfig for all existing letters that don't have one.
  // This is a one-time migration helper. Safe to call multiple times.
  .post(
    "/template/backfill",
    async () => {
      const count = await LetterInstanceService.backfillAllTemplateConfigs();
      return {
        success: true,
        message: `Backfilled templateConfig for ${count} letter(s)`,
        data: { updatedCount: count },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
    }
  )

  // ==================== AK006 TEMPLATE MANAGEMENT ====================

  // Get AK006 template configuration
  .get(
    "/template/ak006",
    async ({ status, set }) => {
      // Prevent caching so template updates are always reflected
      set.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      set.headers['Pragma'] = 'no-cache';

      // Find AK006 letter type
      const letterType = await Prisma.letterType.findFirst({
        where: { name: { contains: "AK006", mode: "insensitive" } },
      });

      if (!letterType) {
        // Return default template config if no letter type found
        return {
          success: true,
          data: {
            id: null,
            letterTypeId: null,
            config: getDefaultAK006Template(),
          },
        };
      }

      // Find the latest active template for AK006
      const template = await Prisma.letterTemplate.findFirst({
        where: { letterTypeId: letterType.id, isActive: true },
        orderBy: { createdAt: "desc" },
      });

      if (!template) {
        return {
          success: true,
          data: {
            id: null,
            letterTypeId: letterType.id,
            config: getDefaultAK006Template(),
          },
        };
      }

      return {
        success: true,
        data: {
          id: template.id,
          letterTypeId: letterType.id,
          config: template.schemaDefinition as Record<string, any>,
        },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
    }
  )

  // Update/Create AK006 template configuration
  // VERSIONING: Always creates a new template version. Old letters keep their
  // snapshot in templateConfig so they are not affected by this change.
  .put(
    "/template/ak006",
    async ({ body, status }) => {
      // Find AK006 letter type
      let letterType = await Prisma.letterType.findFirst({
        where: { name: { contains: "AK006", mode: "insensitive" } },
      });

      // Create letter type if not exists
      if (!letterType) {
        letterType = await Prisma.letterType.create({
          data: {
            name: "AK006",
            description: "Surat Keterangan Masih Kuliah",
          },
        });
      }

      // Deactivate all existing templates for this letter type
      await Prisma.letterTemplate.updateMany({
        where: { letterTypeId: letterType.id, isActive: true },
        data: { isActive: false },
      });

      // Count existing templates to auto-generate version name
      const templateCount = await Prisma.letterTemplate.count({
        where: { letterTypeId: letterType.id },
      });
      const nextVersion = `v${templateCount + 1}`;

      // Create NEW template version (always create, never update)
      const template = await Prisma.letterTemplate.create({
        data: {
          letterTypeId: letterType.id,
          schemaDefinition: body.config as any,
          formFields: {},
          versionName: body.versionName || nextVersion,
          isActive: true,
        },
      });

      return {
        success: true,
        message: "Template AK006 berhasil disimpan sebagai versi baru",
        data: {
          id: template.id,
          letterTypeId: letterType.id,
          versionName: template.versionName,
          config: template.schemaDefinition as Record<string, any>,
        },
      };
    },
    {
      ...requireRole(SUPERADMIN_ROLE),
      body: t.Object({
        config: t.Any(),
        versionName: t.Optional(t.String()),
      }),
    }
  );
