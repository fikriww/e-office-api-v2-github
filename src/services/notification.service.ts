import { Prisma } from '@backend/db/index.ts';
import type { NotificationType } from '@backend/generated/prisma/client.ts';

export interface CreateNotificationParams {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    letterInstanceId?: string;
    metadata?: Record<string, any>;
}

export const notificationService = {
    /**
     * Create a notification for a specific user
     */
    async createNotification(params: CreateNotificationParams) {
        return Prisma.notification.create({
            data: {
                userId: params.userId,
                type: params.type,
                title: params.title,
                message: params.message,
                letterInstanceId: params.letterInstanceId,
                metadata: params.metadata,
            },
        });
    },

    /**
     * Create notifications for users with a specific role
     */
    async createNotificationForRole(
        roleName: string,
        params: Omit<CreateNotificationParams, 'userId'>
    ) {
        // Find all users with the specified role
        const usersWithRole = await Prisma.userRole.findMany({
            where: {
                role: {
                    name: roleName,
                },
            },
            include: {
                user: true,
            },
        });

        // Create notifications for each user
        const notifications = await Promise.all(
            usersWithRole.map((userRole: { userId: string; user: any }) =>
                Prisma.notification.create({
                    data: {
                        userId: userRole.userId,
                        type: params.type,
                        title: params.title,
                        message: params.message,
                        letterInstanceId: params.letterInstanceId,
                        metadata: params.metadata,
                    },
                })
            )
        );

        return notifications;
    },

    /**
     * Get all notifications for a user
     */
    async getNotifications(userId: string, limit = 20, unreadOnly = false) {
        return Prisma.notification.findMany({
            where: {
                userId,
                ...(unreadOnly ? { isRead: false } : {}),
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: limit,
            include: {
                letterInstance: {
                    select: {
                        id: true,
                        letterType: {
                            select: {
                                name: true,
                            },
                        },
                        createdBy: {
                            select: {
                                name: true,
                            },
                        },
                    },
                },
            },
        });
    },

    /**
     * Get unread notification count for a user
     */
    async getUnreadCount(userId: string) {
        return Prisma.notification.count({
            where: {
                userId,
                isRead: false,
            },
        });
    },

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string, userId: string) {
        return Prisma.notification.updateMany({
            where: {
                id: notificationId,
                userId,
            },
            data: {
                isRead: true,
            },
        });
    },

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string) {
        return Prisma.notification.updateMany({
            where: {
                userId,
                isRead: false,
            },
            data: {
                isRead: true,
            },
        });
    },

    /**
     * Delete a notification
     */
    async deleteNotification(notificationId: string, userId: string) {
        return Prisma.notification.deleteMany({
            where: {
                id: notificationId,
                userId,
            },
        });
    },

    // ============ BUSINESS LOGIC HELPERS ============

    /**
     * Notify SA when a new letter is submitted by Mahasiswa
     */
    async notifySANewLetter(
        letterInstanceId: string,
        mahasiswaName: string,
        letterTypeName: string
    ) {
        // Also notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'NEEDS_VERIFICATION',
            title: 'Surat Baru (Superadmin)',
            message: `${mahasiswaName} mengajukan ${letterTypeName}.`,
            letterInstanceId,
        });

        return this.createNotificationForRole('supervisor_akademik', {
            type: 'NEEDS_VERIFICATION',
            title: 'Surat Baru Perlu Diverifikasi',
            message: `${mahasiswaName} mengajukan ${letterTypeName}. Harap melakukan verifikasi.`,
            letterInstanceId,
        });
    },

    /**
     * Notify MTU when a letter is verified by SA
     */
    async notifyMTULetterVerified(
        letterInstanceId: string,
        mahasiswaName: string,
        letterTypeName: string
    ) {
        // Also notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'NEEDS_SIGNATURE',
            title: 'Surat Perlu Ditandatangani (Superadmin)',
            message: `${letterTypeName} dari ${mahasiswaName} telah diverifikasi.`,
            letterInstanceId,
        });

        return this.createNotificationForRole('manager_tu', {
            type: 'NEEDS_SIGNATURE',
            title: 'Surat Perlu Ditandatangani',
            message: `${letterTypeName} dari ${mahasiswaName} telah diverifikasi dan perlu ditandatangani.`,
            letterInstanceId,
        });
    },

    /**
     * Notify UPA when a letter is signed by MTU
     */
    async notifyUPALetterSigned(
        letterInstanceId: string,
        mahasiswaName: string,
        letterTypeName: string
    ) {
        // Also notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'NEEDS_NUMBERING',
            title: 'Surat Perlu Diberi Penomoran (Superadmin)',
            message: `${letterTypeName} dari ${mahasiswaName} telah ditandatangani.`,
            letterInstanceId,
        });

        return this.createNotificationForRole('upa', {
            type: 'NEEDS_NUMBERING',
            title: 'Surat Perlu Diberi Penomoran',
            message: `${letterTypeName} dari ${mahasiswaName} telah ditandatangani dan perlu diberi nomor surat.`,
            letterInstanceId,
        });
    },

    /**
     * Notify Mahasiswa when letter needs revision
     */
    async notifyMahasiswaRevision(
        userId: string,
        letterInstanceId: string,
        letterTypeName: string,
        comments: string,
        revisorRole: string
    ) {
        // Notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'REVISION_REQUIRED',
            title: 'Surat Revisi (Superadmin)',
            message: `${letterTypeName} perlu direvisi oleh ${revisorRole}.`,
            letterInstanceId,
        });

        return this.createNotification({
            userId,
            type: 'REVISION_REQUIRED',
            title: 'Surat Perlu Direvisi',
            message: `${letterTypeName} Anda perlu direvisi oleh ${revisorRole}. Catatan: ${comments}`,
            letterInstanceId,
        });
    },

    /**
     * Notify SA when letter needs revision (sent back from MTU)
     */
    async notifySARevision(
        letterInstanceId: string,
        letterTypeName: string,
        mahasiswaName: string,
        comments: string
    ) {
        // Notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'REVISION_REQUIRED',
            title: 'Surat Revisi ke SA (Superadmin)',
            message: `${letterTypeName} dari ${mahasiswaName} dikembalikan ke SA.`,
            letterInstanceId,
        });

        return this.createNotificationForRole('supervisor_akademik', {
            type: 'REVISION_REQUIRED',
            title: 'Surat Perlu Direvisi',
            message: `${letterTypeName} dari ${mahasiswaName} dikembalikan untuk revisi. Catatan: ${comments}`,
            letterInstanceId,
        });
    },

    /**
     * Notify Mahasiswa when letter is rejected
     */
    async notifyMahasiswaRejection(
        userId: string,
        letterInstanceId: string,
        letterTypeName: string,
        comments: string,
        rejectorRole: string
    ) {
        // Notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'LETTER_REJECTED',
            title: 'Surat Ditolak (Superadmin)',
            message: `${letterTypeName} ditolak oleh ${rejectorRole}.`,
            letterInstanceId,
        });

        return this.createNotification({
            userId,
            type: 'LETTER_REJECTED',
            title: 'Surat Ditolak',
            message: `${letterTypeName} Anda ditolak oleh ${rejectorRole}. Alasan: ${comments}`,
            letterInstanceId,
        });
    },

    /**
     * Notify Mahasiswa when letter is completed
     */
    async notifyMahasiswaCompleted(
        userId: string,
        letterInstanceId: string,
        letterTypeName: string
    ) {
        // Notify Superadmin
        await this.createNotificationForRole('superadmin', {
            type: 'LETTER_COMPLETED',
            title: 'Surat Selesai (Superadmin)',
            message: `${letterTypeName} selesai diproses.`,
            letterInstanceId,
        });

        return this.createNotification({
            userId,
            type: 'LETTER_COMPLETED',
            title: 'Surat Selesai Diproses',
            message: `${letterTypeName} Anda telah selesai diproses dan dapat diunduh.`,
            letterInstanceId,
        });
    },

    /**
     * Notify Mahasiswa when letter is verified by SA
     */
    async notifyMahasiswaVerified(
        userId: string,
        letterInstanceId: string,
        letterTypeName: string
    ) {
        return this.createNotification({
            userId,
            type: 'LETTER_VERIFIED',
            title: 'Surat Telah Diverifikasi',
            message: `${letterTypeName} Anda telah diverifikasi oleh Supervisor Akademik.`,
            letterInstanceId,
        });
    },

    /**
     * Notify Mahasiswa when letter is signed by MTU
     */
    async notifyMahasiswaSigned(
        userId: string,
        letterInstanceId: string,
        letterTypeName: string
    ) {
        return this.createNotification({
            userId,
            type: 'LETTER_SIGNED',
            title: 'Surat Telah Ditandatangani',
            message: `${letterTypeName} Anda telah ditandatangani oleh Manajer TU.`,
            letterInstanceId,
        });
    },
};
