import { Elysia, t } from 'elysia';
import { notificationService } from '@backend/services/notification.service.ts';
import { authGuardPlugin } from '@backend/middlewares/auth.ts';

export default new Elysia()
    .use(authGuardPlugin)
    // Get notifications for the current user
    .get(
        '/',
        async ({ user }) => {
            try {
                const notifications = await notificationService.getNotifications(
                    user.id
                );
                const unreadCount = await notificationService.getUnreadCount(
                    user.id
                );
                return {
                    success: true,
                    data: {
                        notifications,
                        unreadCount,
                    },
                };
            } catch (error) {
                console.error('Error fetching notifications:', error);
                return {
                    success: false,
                    message: 'Failed to fetch notifications',
                };
            }
        },
        {
            query: t.Object({
                limit: t.Optional(t.Number()),
                unreadOnly: t.Optional(t.Boolean()),
            }),
        }
    )

    // Get unread count only
    .get('/unread-count', async ({ user }) => {
        try {
            const unreadCount = await notificationService.getUnreadCount(
                user.id
            );
            return {
                success: true,
                data: { unreadCount },
            };
        } catch (error) {
            console.error('Error fetching unread count:', error);
            return {
                success: false,
                message: 'Failed to fetch unread count',
            };
        }
    })

    // Mark a notification as read
    .post(
        '/:id/read',
        async ({ user, params }) => {
            try {
                await notificationService.markAsRead(params.id, user.id);
                return {
                    success: true,
                    message: 'Notification marked as read',
                };
            } catch (error) {
                console.error('Error marking notification as read:', error);
                return {
                    success: false,
                    message: 'Failed to mark notification as read',
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        }
    )

    // Mark all notifications as read
    .post('/read-all', async ({ user }) => {
        try {
            await notificationService.markAllAsRead(user.id);
            return {
                success: true,
                message: 'All notifications marked as read',
            };
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            return {
                success: false,
                message: 'Failed to mark all notifications as read',
            };
        }
    })

    // Delete a notification
    .delete(
        '/:id',
        async ({ user, params }) => {
            try {
                await notificationService.deleteNotification(params.id, user.id);
                return {
                    success: true,
                    message: 'Notification deleted',
                };
            } catch (error) {
                console.error('Error deleting notification:', error);
                return {
                    success: false,
                    message: 'Failed to delete notification',
                };
            }
        },
        {
            params: t.Object({
                id: t.String(),
            }),
        }
    );
