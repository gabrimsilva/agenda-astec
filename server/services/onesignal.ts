import * as OneSignal from "onesignal-node";
import { storage } from "../storage";
import { db } from "../db";
import { notifications } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { InsertNotification } from "@shared/schema";

const appId = process.env.ONESIGNAL_APP_ID;
const apiKey = process.env.ONESIGNAL_API_KEY;

if (!appId || !apiKey) {
  console.warn("OneSignal credentials not configured - push notifications will be disabled");
}

const client = appId && apiKey 
  ? new OneSignal.Client(appId, apiKey)
  : null;

export interface PushNotificationOptions {
  userId: string;
  title: string;
  message: string;
  type: "nova_atividade" | "atividade_modificada" | "lembrete_atividade" | "aprovacao_pendente" | "aprovacao_respondida" | "mensagem_admin" | "alerta_sistema";
  data?: Record<string, any>;
  url?: string;
}

export async function sendPushNotification(options: PushNotificationOptions): Promise<void> {
  try {
    const notificationData: InsertNotification = {
      userId: options.userId,
      type: options.type,
      title: options.title,
      message: options.message,
      data: options.data ? JSON.stringify(options.data) : null,
      isRead: false,
      sentToPush: false,
    };

    const savedNotification = await storage.createNotification(notificationData);

    if (!client) {
      console.warn("OneSignal client not initialized - notification saved to database only");
      return;
    }

    const subscriptions = await storage.getUserPushSubscriptions(options.userId);
    
    if (subscriptions.length === 0) {
      console.log(`User ${options.userId} has no active push subscriptions`);
      return;
    }

    const playerIds = subscriptions.map(sub => sub.playerId);

    const notification = {
      headings: { en: options.title, pt: options.title },
      contents: { en: options.message, pt: options.message },
      include_player_ids: playerIds,
      data: {
        notificationId: savedNotification.id,
        type: options.type,
        ...(options.data || {}),
      },
      ...(options.url ? { url: options.url } : {}),
    };

    const response = await client.createNotification(notification);
    
    await db.update(notifications)
      .set({ sentToPush: true })
      .where(eq(notifications.id, savedNotification.id));
    
    console.log(`Push notification sent to ${playerIds.length} devices for user ${options.userId}:`, response);
  } catch (error) {
    console.error("Failed to send push notification:", error);
    throw error;
  }
}

export async function sendBulkNotifications(notifications: PushNotificationOptions[]): Promise<void> {
  await Promise.allSettled(
    notifications.map(notification => sendPushNotification(notification))
  );
}
