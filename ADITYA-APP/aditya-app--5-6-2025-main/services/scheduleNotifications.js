import * as Notifications from 'expo-notifications';

export default async function scheduleNotifications(task) {
  try {
    // Request permission if not already granted
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Notification permissions not granted!');
      return;
    }

    const deadlineDate = new Date(task.deadline);
    const now = new Date();

    // Ensure deadline is in the future
    if (deadlineDate <= now) {
      console.warn('Deadline must be in the future');
      return;
    }

    const reminders = [
      { label: '1 day', offset: 24 * 60 * 60 * 1000 },
      { label: '1 hour', offset: 60 * 60 * 1000 },
      { label: '30 minutes', offset: 30 * 60 * 1000 },
    ];

    // Cancel any existing notifications for this task
    await Notifications.cancelScheduledNotificationAsync(task.id);

    for (const { label, offset } of reminders) {
      const notifyTime = new Date(deadlineDate.getTime() - offset);
      
      if (notifyTime > now) {
        await Notifications.scheduleNotificationAsync({
          identifier: `${task.id}-${label.replace(/\s/g, '')}`, // Unique identifier
          content: {
            title: "Task Reminder",
            body: `Your task "${task.title}" is due in ${label}.`,
            data: { taskId: task.id },
            sound: true, // Enable sound
          },
          trigger: {
            date: notifyTime, // Exact date to trigger
          },
        });
        console.log(`Scheduled ${label} reminder for task ${task.id}`);
      }
    }
  } catch (error) {
    console.error('Error scheduling notifications:', error);
  }
}