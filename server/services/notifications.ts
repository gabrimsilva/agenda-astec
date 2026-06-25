import { storage } from "../storage";
import { sendPushNotification } from "./onesignal";
import { db } from "../db";
import { activities, sentReminders, technicians, activityTypes } from "@shared/schema";
import { eq, and, gte, lte, sql } from "drizzle-orm";

interface ReminderConfig {
  type: "30min_before" | "time_to_start" | "time_to_complete";
  checkCondition: (activity: any, now: Date) => boolean;
  notificationData: (activity: any, technicianName: string) => {
    title: string;
    message: string;
  };
}

const REMINDER_CONFIGS: ReminderConfig[] = [
  {
    type: "30min_before",
    checkCondition: (activity, now) => {
      if (activity.status !== "planejado") return false;
      
      const scheduledTime = new Date(activity.scheduledDate);
      scheduledTime.setHours(
        parseInt(activity.startTime?.split(":")[0] || "0"),
        parseInt(activity.startTime?.split(":")[1] || "0"),
        0, 0
      );
      
      const thirtyMinBefore = new Date(scheduledTime.getTime() - 30 * 60 * 1000);
      const fiveMinAfter = new Date(scheduledTime.getTime() - 25 * 60 * 1000);
      
      return now >= thirtyMinBefore && now < fiveMinAfter;
    },
    notificationData: (activity, technicianName) => ({
      title: "Lembrete: Atividade em 30 minutos",
      message: `Olá ${technicianName}, sua atividade está agendada para começar em 30 minutos. ${activity.description ? `Descrição: ${activity.description}` : ""}`,
    }),
  },
  {
    type: "time_to_start",
    checkCondition: (activity, now) => {
      if (activity.status !== "planejado") return false;
      
      const scheduledTime = new Date(activity.scheduledDate);
      scheduledTime.setHours(
        parseInt(activity.startTime?.split(":")[0] || "0"),
        parseInt(activity.startTime?.split(":")[1] || "0"),
        0, 0
      );
      
      const fiveMinWindow = 5 * 60 * 1000;
      const timeDiff = now.getTime() - scheduledTime.getTime();
      
      return timeDiff >= 0 && timeDiff < fiveMinWindow;
    },
    notificationData: (activity, technicianName) => ({
      title: "Hora de Iniciar Atividade",
      message: `${technicianName}, está na hora de iniciar a atividade. ${activity.description ? `Descrição: ${activity.description}.` : ""} Clique para fazer check-in.`,
    }),
  },
  {
    type: "time_to_complete",
    checkCondition: (activity, now) => {
      if (activity.status !== "emExecucao") return false;
      
      if (!activity.checkInTime) return false;
      
      const checkInTime = new Date(activity.checkInTime);
      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      
      return checkInTime <= twoHoursAgo;
    },
    notificationData: (activity, technicianName) => ({
      title: "Lembrete: Concluir Atividade",
      message: `${technicianName}, você está trabalhando nesta atividade há mais de 2 horas. ${activity.description ? `Descrição: ${activity.description}.` : ""} Não se esqueça de fazer o check-out ao finalizar.`,
    }),
  },
];

export async function checkAndSendReminders(): Promise<void> {
  try {
    const now = new Date();
    
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 2);
    
    // Get all activities that need reminders:
    // - planejado: only today and tomorrow (for 30min and start reminders)
    // - emExecucao: ALL regardless of scheduled date (for completion reminders)
    const plannedActivities = await db
      .select({
        activity: activities,
        technicianName: technicians.name,
        technicianUserId: technicians.userId,
      })
      .from(activities)
      .leftJoin(technicians, eq(activities.technicianId, technicians.id))
      .where(
        and(
          gte(activities.scheduledDate, today),
          lte(activities.scheduledDate, tomorrow),
          eq(activities.status, "planejado")
        )
      );
    
    const inProgressActivities = await db
      .select({
        activity: activities,
        technicianName: technicians.name,
        technicianUserId: technicians.userId,
      })
      .from(activities)
      .leftJoin(technicians, eq(activities.technicianId, technicians.id))
      .where(eq(activities.status, "emExecucao"));
    
    const activitiesToCheck = [...plannedActivities, ...inProgressActivities];

    for (const { activity, technicianName, technicianUserId } of activitiesToCheck) {
      if (!technicianUserId || !technicianName) continue;

      for (const config of REMINDER_CONFIGS) {
        if (config.checkCondition(activity, now)) {
          const alreadySent = await db
            .select()
            .from(sentReminders)
            .where(
              and(
                eq(sentReminders.activityId, activity.id),
                eq(sentReminders.reminderType, config.type)
              )
            )
            .limit(1);

          if (alreadySent.length === 0) {
            const { title, message } = config.notificationData(activity, technicianName);
            
            await sendPushNotification({
              userId: technicianUserId,
              type: "lembrete_atividade",
              title,
              message,
              data: {
                activityId: activity.id,
                reminderType: config.type,
              },
              url: `/minha-agenda?highlight=${activity.id}`,
            });

            await db.insert(sentReminders).values({
              activityId: activity.id,
              reminderType: config.type,
            });

            console.log(`✅ Sent ${config.type} reminder for activity ${activity.id}`);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error checking and sending reminders:", error);
  }
}

export async function sendActivityCreatedNotification(
  activityId: string,
  createdByUserId: string
): Promise<void> {
  try {
    const result = await db
      .select({
        activity: activities,
        technicianName: technicians.name,
        technicianUserId: technicians.userId,
        activityTypeName: activityTypes.name,
        creatorName: sql<string>`(SELECT name FROM users WHERE id = ${createdByUserId})`.as('creator_name'),
      })
      .from(activities)
      .leftJoin(technicians, eq(activities.technicianId, technicians.id))
      .leftJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .where(eq(activities.id, activityId))
      .limit(1);

    if (result.length === 0) return;

    const { activity, technicianName, technicianUserId, activityTypeName, creatorName } = result[0];

    if (!technicianUserId || !technicianName) return;

    const scheduledTime = new Date(activity.scheduledDate);
    if (activity.startTime) {
      const [hours, minutes] = activity.startTime.split(":");
      scheduledTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    }

    const formattedDate = scheduledTime.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    const formattedTime = activity.startTime || "00:00";

    const title = "Nova Atividade Atribuída";
    const message = `${technicianName}, você tem uma nova atividade agendada para ${formattedDate} às ${formattedTime}. ${activityTypeName ? `Tipo: ${activityTypeName}.` : ""} ${activity.description ? `Descrição: ${activity.description}.` : ""} Atribuída por ${creatorName || "Admin"}.`;

    await sendPushNotification({
      userId: technicianUserId,
      type: "nova_atividade",
      title,
      message,
      data: {
        activityId: activity.id,
        scheduledDate: formattedDate,
        scheduledTime: formattedTime,
      },
      url: `/minha-agenda?highlight=${activity.id}`,
    });

    console.log(`✅ Sent activity creation notification for activity ${activityId}`);
  } catch (error) {
    console.error("Error sending activity created notification:", error);
  }
}

let reminderInterval: NodeJS.Timeout | null = null;

export function startReminderScheduler(): void {
  if (reminderInterval) {
    console.log("⚠️ Reminder scheduler already running");
    return;
  }

  console.log("🚀 Starting notification reminder scheduler...");
  
  checkAndSendReminders();
  
  reminderInterval = setInterval(() => {
    checkAndSendReminders();
  }, 5 * 60 * 1000);

  console.log("✅ Reminder scheduler started (checking every 5 minutes)");
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    console.log("🛑 Reminder scheduler stopped");
  }
}
