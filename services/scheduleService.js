import { firebase } from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';

const scheduleCollection = 'schedules';

export const saveSchedule = async (scheduleData) => {
  try {
    const userEmail = auth().currentUser?.email;
    if (!userEmail) throw new Error('User not authenticated');

    const userScheduleRef = firebase.firestore()
      .collection(scheduleCollection)
      .doc(userEmail);

    await userScheduleRef.set(scheduleData, { merge: true });
    return true;
  } catch (error) {
    console.error('Error saving schedule:', error);
    throw error;
  }
};

export const getSchedule = async () => {
  try {
    const userEmail = auth().currentUser?.email;
    if (!userEmail) throw new Error('User not authenticated');

    const userScheduleRef = firebase.firestore()
      .collection(scheduleCollection)
      .doc(userEmail);

    const doc = await userScheduleRef.get();
    return doc.exists ? doc.data() : null;
  } catch (error) {
    console.error('Error getting schedule:', error);
    throw error;
  }
};

export const updateDailySchedule = async (dailySchedule) => {
  try {
    const userEmail = auth().currentUser?.email;
    if (!userEmail) throw new Error('User not authenticated');

    const userScheduleRef = firebase.firestore()
      .collection(scheduleCollection)
      .doc(userEmail);

    await userScheduleRef.update({
      daily: dailySchedule
    });
    return true;
  } catch (error) {
    console.error('Error updating daily schedule:', error);
    throw error;
  }
};

export const updateWeeklySchedule = async (weeklySchedule) => {
  try {
    const userEmail = auth().currentUser?.email;
    if (!userEmail) throw new Error('User not authenticated');

    const userScheduleRef = firebase.firestore()
      .collection(scheduleCollection)
      .doc(userEmail);

    await userScheduleRef.update({
      weekly: weeklySchedule
    });
    return true;
  } catch (error) {
    console.error('Error updating weekly schedule:', error);
    throw error;
  }
}; 