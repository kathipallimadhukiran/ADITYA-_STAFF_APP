import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  FlatList,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Image,
  AppState,
  Platform,
  Animated,
  Easing,
} from "react-native";
import Icon from "react-native-vector-icons/FontAwesome5";
import { getAuth, db } from "../../services/Firebase/firebaseConfig";
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  FieldValue,
  getDoc,
} from "firebase/firestore";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from 'react-native-paper';
import { fetchUser } from "../../services/Firebase/firestoreService";
import firebase from "firebase/app";
import * as Location from 'expo-location';
import { startLocationTracking, stopLocationTracking } from "../../services/LocationService";
import LocationPermissionScreen from "../../components/LocationPermissionScreen";

const DashboardScreen = ({ route }) => {
  const navigation = useNavigation();
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [todayTasks, setTodayTasks] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const auth = getAuth();
  const currentUser = auth?.currentUser;
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false);
  const refreshIntervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const isInitialMount = useRef(true);
  const dataFetchedRef = useRef(false);
  const REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes in milliseconds
  const [nextRefreshTime, setNextRefreshTime] = useState(new Date());
  const [lastAbsentCheck, setLastAbsentCheck] = useState(null);
  const [needsLocationPermission, setNeedsLocationPermission] = useState(false);
  const blinkAnim = useRef(new Animated.Value(1)).current;

  // Get userType from route params
  const userType = route?.params?.userType?.toLowerCase() || 'student';

  // Debug log for initialization
  useEffect(() => {
    console.log('[DEBUG] DashboardScreen initialized:', {
      userType,
      routeParams: route?.params,
      currentUser: currentUser?.email
    });
  }, [userType, route?.params, currentUser?.email]);

  const staffQuickActions = [
    { id: "1", label: "Mark Attendance", icon: "clipboard-check", bgColor: "#FF9F1C", route: "MarkAttendance" },
    { 
      id: "2", 
      label: "ID Card", 
      icon: "id-card", 
      bgColor: "#3A86FF", 
      route: "DigitalIDCard", 
      params: { 
        userData: user ? {
          ...user,
          qrCode: user.qrCode ? String(user.qrCode) : null
        } : null 
      }
    },
    { id: "3", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "4", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "5", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "6", label: "Notices", icon: "bell", bgColor: "#90BE6D", route: "Notices" },
    { id: "7", label: "Track Location", icon: "map-marker-alt", bgColor: "#D00000", route: "ViewLocations" },
  ];

  const adminQuickActions = [
    { id: "1", label: "Mark Attendance", icon: "clipboard-check", bgColor: "#F94144", route: "MarkAttendance" },
    { 
      id: "2", 
      label: "ID Card", 
      icon: "id-card", 
      bgColor: "#3A86FF", 
      route: "DigitalIDCard", 
      params: { 
        userData: user ? {
          ...user,
          qrCode: user.qrCode ? String(user.qrCode) : null
        } : null 
      }
    },
    { 
      id: "3", 
      label: "User Access", 
      icon: "user-shield", 
      bgColor: "#FF9F1C", 
      route: "UserAccessManagement",
      params: { key: `UserAccess-${Date.now()}` }
    },
    { id: "4", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "5", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "6", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "7", label: "Notices", icon: "bell", bgColor: "#90BE6D", route: "Notices" },
    { id: "8", label: "Track Staff", icon: "map-marked-alt", bgColor: "#D00000", route: "ViewLocations" },
    { id: "9", label: "Attendance Settings", icon: "clock", bgColor: "#6C757D", route: "AttendanceSettings", superAdminOnly: true },
  ];

  const studentQuickActions = [
    { 
      id: "1", 
      label: "ID Card", 
      icon: "id-card", 
      bgColor: "#3A86FF", 
      route: "DigitalIDCard", 
      params: { 
        userData: user ? {
          ...user,
          qrCode: user.qrCode ? String(user.qrCode) : null
        } : null 
      }
    },
    { id: "2", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "3", label: "Class Schedule", icon: "calendar-alt", bgColor: "#2EC4B6", route: "ViewSchedule" },
    { id: "4", label: "Results", icon: "chart-bar", bgColor: "#F3722C", route: "Results" },
    { id: "5", label: "Notices", icon: "bell", bgColor: "#90BE6D", route: "Notices" },
    { id: "6", label: "Track Staff", icon: "map-marked-alt", bgColor: "#D00000", route: "ViewLocations" },
  ];

  // Add this state for attendance settings
  const [attendanceSettings, setAttendanceSettings] = useState({
    startTime: '09:00',
    endTime: '17:00',
    lateMarkingTime: '09:30',
    autoAbsentTime: '23:15',
    relaxationTime: '15',
    workingDays: {
      Sunday: false,
      Monday: true,
      Tuesday: true,
      Wednesday: true,
      Thursday: true,
      Friday: true,
      Saturday: false,
    },
    holidays: []
  });

  // Combined data fetching effect
  useEffect(() => {
    if (!currentUser?.email || dataFetchedRef.current) return;

    const initializeData = async () => {
      try {
        // Fetch user data
        const userData = await fetchUser(currentUser.email);
        if (userData) {
          const isUserSuperAdmin = userData.email === 'kathipallimadhu@gmail.com' || userData.accessLevel === 'Super Admin';
          const userRole = userType || userData.role || 'student';
          
          setUser({
            ...userData,
            role: userRole,
            accessLevel: isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userRole)
          });

          // Debug log for user data
          console.log('[DEBUG] User data loaded:', {
            email: userData.email,
            role: userRole,
            accessLevel: isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userRole)
          });
        }

        // Load attendance data if needed
        if (userType === 'staff' || userType === 'admin' || userType === 'faculty') {
          await loadAttendanceData();
        }

        dataFetchedRef.current = true;
      } catch (error) {
        console.error("Error initializing data:", error);
      }
    };

    initializeData();
  }, [currentUser?.email, userType]);

  // Tasks subscription effect - only start after user data is loaded
  useEffect(() => {
    if (!currentUser?.uid || !user) {
      console.log('[DEBUG] Tasks not fetching - missing user data:', { 
        hasCurrentUser: !!currentUser?.uid, 
        hasUser: !!user 
      });
      return;
    }

    console.log('[DEBUG] Starting tasks fetch for:', {
      uid: currentUser.uid,
      role: user.role,
      email: currentUser.email
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Determine collection based on user role
    const collectionName = user.role?.toLowerCase() === 'student' ? 'studentTasks' : 'facultyTasks';
    console.log('[DEBUG] Using collection:', collectionName);

    try {
      const userEmail = currentUser.email.toLowerCase();
      console.log('[DEBUG] Fetching tasks for email:', userEmail);

      // Get the document reference for the user's tasks
      const userTasksDoc = doc(db, 'tasks', userEmail);

      console.log('[DEBUG] Listening to tasks document:', userEmail);

      const unsubscribe = onSnapshot(userTasksDoc, (docSnapshot) => {
        if (!docSnapshot.exists()) {
          console.log('[DEBUG] No tasks document found for user');
          setTodayTasks([]);
          return;
        }

        const data = docSnapshot.data();
        console.log('[DEBUG] Got tasks data:', data);

        // Get tasks array from the document
        const tasksData = data.tasks || [];
        console.log('[DEBUG] Found tasks array:', tasksData.length);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Filter tasks for today
        const todaysTasks = tasksData.map((task, index) => {
          try {
            let deadline = null;
            if (task.deadline) {
              // Handle different timestamp formats
              if (task.deadline.toDate) {
                deadline = task.deadline.toDate();
              } else if (typeof task.deadline === 'string') {
                deadline = new Date(task.deadline);
              } else if (task.deadline instanceof Date) {
                deadline = task.deadline;
              }

              const taskDate = new Date(deadline);
              taskDate.setHours(0, 0, 0, 0);

              console.log('[DEBUG] Comparing task dates:', {
                taskId: index,
                taskTitle: task.title,
                taskDate: taskDate.toISOString(),
                today: today.toISOString(),
                matches: taskDate.getTime() === today.getTime()
              });

              if (taskDate.getTime() === today.getTime()) {
                return {
                  id: task.id || String(index),
                  ...task,
                  deadline: deadline,
                  completed: task.status === "completed"
                };
              }
            }
            return null;
          } catch (error) {
            console.error('[DEBUG] Error processing task:', error);
            return null;
          }
        }).filter(task => task !== null);

        console.log('[DEBUG] Filtered today\'s tasks:', {
          count: todaysTasks.length,
          tasks: todaysTasks.map(t => ({
            id: t.id,
            title: t.title,
            deadline: t.deadline?.toISOString(),
            status: t.status
          }))
        });

        setTodayTasks(todaysTasks);
        setLastUpdated(new Date());
      }, (error) => {
        console.error("[DEBUG] Error fetching tasks:", error);
        Alert.alert(
          "Error",
          "Failed to load tasks. Please try refreshing the dashboard."
        );
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("[DEBUG] Error setting up tasks query:", error);
    }
  }, [currentUser?.uid, user]);

  // Update the real-time listener useEffect
  useEffect(() => {
    if (!currentUser?.email) return;

    const email = currentUser.email.toLowerCase();
    const today = new Date();
    const year = today.getFullYear().toString();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[today.getMonth()];

    // Set up real-time listener for monthly records
    const unsubscribe = db
      .collection('user_attendance')
      .doc(email)
      .collection(year)
      .doc(monthName)
      .collection('records')
      .onSnapshot(
        (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data();

            // Check if this record is for today
            if (data.dateStr === dateStr) {
              setTodayAttendance(data);
              // Refresh the monthly stats when today's attendance changes
              loadAttendanceData();
            }
          });
        },
        (error) => {
          console.error('Error in attendance listener:', error);
        }
      );

    return () => unsubscribe();
  }, [currentUser?.email]);

  // Add this effect to load attendance settings
  useEffect(() => {
    const loadAttendanceSettings = async () => {
      try {
        const doc = await db.collection('settings').doc('attendance').get();
        if (doc.exists) {
          setAttendanceSettings(doc.data());
        }
      } catch (error) {
        console.error('Error loading attendance settings:', error);
      }
    };

    loadAttendanceSettings();
  }, []);

  // Define loadAttendanceData at the component level
  const loadAttendanceData = async () => {
    try {
      if (!currentUser?.email) {
        console.error("No user email available");
        return;
      }

      const email = currentUser.email.toLowerCase();
      const today = new Date();
      const year = today.getFullYear().toString();
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
      const monthName = monthNames[today.getMonth()];

      // Format the date to match the database format (M/D/YYYY)
      const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

      // Get attendance settings first
      const settingsDoc = await db.collection('settings').doc('attendance').get();
      const settings = settingsDoc.exists ? settingsDoc.data() : null;

      // Get monthly attendance records
      const monthlyRecordsRef = db
        .collection('user_attendance')
        .doc(email)
        .collection(year)
        .doc(monthName)
        .collection('records');

      const monthlyDocs = await monthlyRecordsRef.get();

      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let totalWorkingDays = 0;
      let dailyRecords = [];
      let todayAttendanceFound = false;

      // Calculate total working days in the month
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(today.getFullYear(), today.getMonth(), day);
        const dayName = date.toLocaleString('default', { weekday: 'long' });
        const dateStr = date.toISOString().split('T')[0];

        // Skip if it's a holiday
        if (settings?.holidays?.some(holiday => holiday.date === dateStr)) {
          continue;
        }

        // Skip if it's not a working day
        if (!settings?.workingDays?.[dayName]?.isWorking) {
          continue;
        }

        // If we've reached today's date, stop counting future days
        if (day > today.getDate()) {
          break;
        }

        totalWorkingDays++;
      }

      monthlyDocs.forEach(doc => {
        const data = doc.data();

        // Check if this record is for today
        if (data.dateStr === dateStr) {
          setTodayAttendance(data);
          todayAttendanceFound = true;
        }

        dailyRecords.push({
          day: data.date,
          status: data.status,
          time: data.timeStr,
          confidence: data.confidence,
          verificationStatus: data.verificationStatus,
          dayName: data.dayName,
          dateStr: data.dateStr,
          location: data.location
        });

        if (data.status === 'Present') {
          presentCount++;
        } else if (data.status === 'Late') {
          presentCount++; // Count late as present
          lateCount++;
        } else if (data.status === 'Absent') {
          absentCount++;
        }
      });

      // If we haven't found today's attendance in the monthly records
      if (!todayAttendanceFound) {
        setTodayAttendance(null);
      }

      // Sort records by date
      dailyRecords.sort((a, b) => {
        const dateA = new Date(a.dateStr);
        const dateB = new Date(b.dateStr);
        return dateA - dateB;
      });

      const stats = {
        totalWorkingDays,
        present: presentCount,
        absent: absentCount,
        late: lateCount,
        percentage: totalWorkingDays > 0 ? ((presentCount / totalWorkingDays) * 100) : 0,
        dailyRecords
      };

      setAttendanceStats(stats);

    } catch (error) {
      console.error("Error loading attendance data:", error);
      console.error("Error stack:", error.stack);
      Alert.alert("Error", "Failed to load attendance data. Please try again.");
    }
  };

  // Update the markAbsentAutomatically function
  const markAbsentAutomatically = async () => {
    try {
      if (!currentUser?.email) return;

      const now = new Date();
      const currentDay = now.toLocaleString('default', { weekday: 'long' });
      const email = currentUser.email.toLowerCase();

      // Get attendance settings
      const settingsDoc = await db.collection('settings').doc('attendance').get();
      if (!settingsDoc.exists) {
        console.log('No attendance settings found');
        return;
      }
      const settings = settingsDoc.data();
      const daySettings = settings.workingDays[currentDay];

      // Check if it's a working day
      if (!daySettings?.isWorking) {
        console.log('Not a working day, skipping absent marking');
        return;
      }

      // Check if it's a holiday
      const todayStr = now.toISOString().split('T')[0];
      const isHoliday = settings.holidays.some(holiday => holiday.date === todayStr);
      if (isHoliday) {
        console.log('Holiday, skipping absent marking');
        return;
      }

      // Parse auto absent time
      const [autoHour, autoMinute] = daySettings.autoAbsentTime.split(':').map(Number);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Check if current time is past auto absent time
      if (currentHour > autoHour || (currentHour === autoHour && currentMinute >= autoMinute)) {
        console.log('Past auto absent time, checking attendance status');

        // Prepare batch write
        const batch = db.batch();

        const year = now.getFullYear().toString();
        const monthName = now.toLocaleString('default', { month: 'long' });
        const date = now.getDate();
        const weekNumber = Math.ceil((now - new Date(year, 0, 1)) / 604800000);
        const attendanceId = `${date}-${monthName}-${year}`;

        // Get user data
        const userDoc = await db.collection('users').doc(email).get();
        if (!userDoc.exists) {
          console.error('User document not found');
          return;
        }
        const userData = userDoc.data();

        // Check if attendance already exists
        const attendanceRef = db
          .collection('user_attendance')
          .doc(email)
          .collection(year)
          .doc(monthName)
          .collection('records')
          .doc(attendanceId);

        const dailyAttendanceRef = db
          .collection('daily_attendance')
          .doc(year)
          .collection(monthName)
          .doc(`${currentDay}_${date}`)
          .collection('records')
          .doc(email);

        const attendanceDoc = await attendanceRef.get();
        if (!attendanceDoc.exists) {
          console.log('No attendance found for today, marking as absent');

          const absentData = {
            userId: email,
            userName: userData?.name || '',
            userRole: userData?.role || 'staff',
            status: 'Absent',
            verificationStatus: 'Auto Marked',
            isLate: true,
            timestamp: now,
            timeStr: daySettings.autoAbsentTime,
            dateStr: `${now.getMonth() + 1}/${date}/${year}`,
            year: year,
            month: monthName,
            monthNumber: now.getMonth() + 1,
            date: date,
            dayName: currentDay,
            dayOfWeek: now.getDay(),
            weekNumber: weekNumber,
            daySettings: {
              startTime: daySettings.startTime,
              endTime: daySettings.endTime,
              lateMarkingTime: daySettings.lateMarkingTime,
              autoAbsentTime: daySettings.autoAbsentTime,
              relaxationTime: daySettings.relaxationTime
            },
            createdAt: now,
            lastUpdated: now,
            deviceInfo: {
              timestamp: now.toISOString(),
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
            }
          };

          // Add both writes to batch
          batch.set(dailyAttendanceRef, absentData);
          batch.set(attendanceRef, absentData);

          // Commit the batch
          await batch.commit();

          console.log('Successfully marked as absent automatically');
          setTodayAttendance(absentData);
          await loadAttendanceData();

          // Show notification to user
          Alert.alert(
            "Automatic Absent Marking",
            `You have been marked as absent for today as you did not mark attendance before ${daySettings.autoAbsentTime}.`,
            [{ text: "OK" }]
          );
        } else {
          console.log('Attendance already exists for today');
        }
      }
    } catch (error) {
      console.error('Error in automatic absent marking:', error);
    }
  };

  // Consolidate location tracking initialization
  useEffect(() => {
    let isInitialized = false;

    const initializeLocationTracking = async () => {
      try {
        // Prevent multiple initializations
        if (isInitialized) {
          return;
        }

        if (!user || !['staff','faculty', 'admin'].includes(user?.role?.toLowerCase())) {
          console.log('User not authorized for location tracking');
          return;
        }

        // Start tracking immediately for authorized users
        console.log('Starting location tracking for authorized user');
        isInitialized = true;
        await startLocationTracking();
      } catch (error) {
        console.error('Error initializing location tracking:', error);
      }
    };

    initializeLocationTracking();

    // Cleanup function
    return () => {
      if (user && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
        stopLocationTracking().catch(error => {
          console.error('Error stopping location tracking:', error);
        });
      }
    };
  }, [user?.role, user?.email]);

  // Update the useFocusEffect to reduce logging
  useFocusEffect(
    React.useCallback(() => {
      let isFirstLoad = true;

      if (isFirstLoad) {
        refreshData();
        isFirstLoad = false;
      }

      // Handle app state changes with debounce
      let lastAppStateChange = Date.now();
      const APP_STATE_DEBOUNCE = 2000; // 2 seconds debounce

      const subscription = AppState.addEventListener('change', async (nextAppState) => {
        const prevState = appStateRef.current;
        const now = Date.now();

        // Debounce app state changes
        if (now - lastAppStateChange < APP_STATE_DEBOUNCE) {
          return;
        }
        lastAppStateChange = now;

        appStateRef.current = nextAppState;
      });

      return () => {
        subscription.remove();
      };
    }, [currentUser?.email, user?.role])
  );

  // Update the refreshData function to reduce logging
  const refreshData = async () => {
    if (refreshing) return;
    setRefreshing(true);

    try {
      if (!currentUser?.email) return;

      const userData = await fetchUser(currentUser.email);
      if (userData) {
        const isUserSuperAdmin = userData.email === 'kathipallimadhu@gmail.com' || userData.accessLevel === 'Super Admin';
        setUser(prev => ({
          ...prev,
          ...userData,
          accessLevel: isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userData.role || 'student')
        }));
      }

      if (shouldShowAttendance()) {
        await loadAttendanceData();
      }

      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Update the attendance visibility check
  const shouldShowAttendance = () => {
    const userRole = user?.role?.toLowerCase() || '';
    const userAccess = user?.accessLevel?.toLowerCase() || '';
    return (
      userRole === 'staff' ||
      userRole === 'admin' ||
      userRole === 'faculty' ||   
      userRole.includes('admin') ||
      userAccess.includes('admin')
    );
  };

  // Update the quick actions section
  const getQuickActions = () => {
    // Debug log for quick actions
    console.log('[DEBUG] Getting quick actions for:', {
      userType,
      userRole: user?.role,
      accessLevel: user?.accessLevel
    });

    switch (userType) {
      case 'admin':
        return adminQuickActions;
      case 'staff':
      case 'faculty':
        return staffQuickActions;
      case 'student':
      default:
        return studentQuickActions;
    }
  };

  const toggleTaskCompletion = async (taskId) => {
    try {
      const userEmail = currentUser.email.toLowerCase();
      console.log('[DEBUG] Toggling task completion:', {
        taskId,
        userEmail
      });

      // Get the current tasks document
      const userTasksDoc = doc(db, 'tasks', userEmail);
      const docSnap = await getDoc(userTasksDoc);

      if (!docSnap.exists()) {
        console.error('[DEBUG] No tasks document found for user');
        return;
      }

      // Get current tasks array
      const data = docSnap.data();
      const tasks = data.tasks || [];

      // Find the task to update
      const taskIndex = tasks.findIndex(task => task.id === taskId);
      
      if (taskIndex === -1) {
        console.error('[DEBUG] Task not found:', taskId);
        return;
      }

      console.log('[DEBUG] Found task to update:', {
        taskIndex,
        currentStatus: tasks[taskIndex].status
      });

      // Update the task status
      const newStatus = tasks[taskIndex].status === "completed" ? "pending" : "completed";
      tasks[taskIndex] = {
        ...tasks[taskIndex],
        status: newStatus,
        updatedAt: new Date().toISOString()
      };

      // Update the entire tasks array
      await updateDoc(userTasksDoc, {
        tasks: tasks
      });

      console.log('[DEBUG] Successfully updated task status');

    } catch (error) {
      console.error("Error updating task:", error);
      Alert.alert(
        "Error",
        "Failed to update task status. Please try again."
      );
    }
  };

  const formatTime = (date) => {
    if (!date || isNaN(date.getTime())) return "No time";
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return "No date";

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  const getLocationName = async (latitude, longitude) => {
    try {
      const response = await Location.reverseGeocodeAsync({
        latitude,
        longitude
      });

      if (response && response[0]) {
        const address = response[0];
        return `${address.street || ''} ${address.district || ''} ${address.city || ''} ${address.region || ''}`.trim();
      }
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    } catch (error) {
      console.error('Error getting location name:', error);
      return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
    }
  };

  const AttendanceCard = () => {
    const [locationName, setLocationName] = useState('');

    useEffect(() => {
      const fetchLocationName = async () => {
        if (todayAttendance?.location?.latitude && todayAttendance?.location?.longitude) {
          try {
            const name = await getLocationName(
              todayAttendance.location.latitude,
              todayAttendance.location.longitude
            );
            setLocationName(name);
          } catch (error) {
            console.error('Error fetching location name:', error);
          }
        }
      };

      fetchLocationName();
    }, [todayAttendance?.location]);

    // Format time to 24-hour format
    const formatTime = (timeStr) => {
      if (!timeStr) return '';
      if (timeStr.includes(':') && !timeStr.toLowerCase().includes('m')) {
        return timeStr;
      }
      const [time, period] = timeStr.split(' ');
      const [hours, minutes] = time.split(':').map(Number);
      let hour24 = hours;

      if (period?.toLowerCase() === 'pm' && hours !== 12) {
        hour24 = hours + 12;
      } else if (period?.toLowerCase() === 'am' && hours === 12) {
        hour24 = 0;
      }

      return `${hour24.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    const getStatusDisplay = (attendance) => {
      if (!attendance) return { text: 'Not Marked Yet', color: '#FF9800' };

      if (attendance.status === 'Late') {
        return {
          text: 'Present (Late)',
          color: '#FF9800',
          icon: 'clock'
        };
      }

      const statusMap = {
        'Present': { text: 'Present', color: '#4CAF50', icon: 'check-circle' },
        'Absent': { text: 'Absent', color: '#F44336', icon: 'times-circle' }
      };

      return statusMap[attendance.status] || { text: attendance.status, color: '#1D3557', icon: 'info-circle' };
    };

    const statusInfo = getStatusDisplay(todayAttendance);

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Today's Attendance</Text>
          {todayAttendance ? (
            <View>
              <View style={styles.statusContainer}>
                <Icon
                  name={statusInfo.icon}
                  size={24}
                  color={statusInfo.color}
                  style={styles.statusIcon}
                />
                <Text style={[styles.statusText, { color: statusInfo.color }]}>
                  {statusInfo.text}
                </Text>
              </View>

              <View style={styles.attendanceDetails}>
                {/* Time Information */}
                <View style={styles.detailRow}>
                  <Icon name="clock" size={16} color="#457B9D" style={styles.detailIcon} />
                  <View style={styles.detailTexts}>
                    <Text style={styles.detailLabel}>Time (24h):</Text>
                    <Text style={[
                      styles.detailValue,
                      todayAttendance.isLate && { color: '#FF9800' }
                    ]}>
                      {formatTime(todayAttendance.timeStr)}
                      {todayAttendance.isLate && ' (Late)'}
                    </Text>
                  </View>
                </View>

                {/* Date Information */}
                <View style={styles.detailRow}>
                  <Icon name="calendar-day" size={16} color="#457B9D" style={styles.detailIcon} />
                  <View style={styles.detailTexts}>
                    <Text style={styles.detailLabel}>Date:</Text>
                    <Text style={styles.detailValue}>
                      {todayAttendance.dayName}, {todayAttendance.dateStr}
                    </Text>
                  </View>
                </View>

                {/* Late Information */}
                {todayAttendance.isLate && (
                  <View style={styles.detailRow}>
                    <Icon name="exclamation-triangle" size={16} color="#FF9800" style={styles.detailIcon} />
                    <View style={styles.detailTexts}>
                      <Text style={styles.detailLabel}>Late Marking:</Text>
                      <Text style={[styles.detailValue, { color: '#FF9800' }]}>
                        After {formatTime(todayAttendance.daySettings?.lateMarkingTime)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Verification Status */}
                <View style={styles.detailRow}>
                  <Icon name="shield-alt" size={16} color="#457B9D" style={styles.detailIcon} />
                  <View style={styles.detailTexts}>
                    <Text style={styles.detailLabel}>Verification:</Text>
                    <Text style={styles.detailValue}>
                      {todayAttendance.verificationStatus}
                    </Text>
                  </View>
                </View>

                {/* Location Information */}
                {todayAttendance.location && (
                  <View style={styles.detailRow}>
                    <Icon name="map-marker-alt" size={16} color="#457B9D" style={styles.detailIcon} />
                    <View style={styles.detailTexts}>
                      <Text style={styles.detailLabel}>Location:</Text>
                      <Text style={styles.detailValue}>
                        {locationName || 'Fetching location...'}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          ) : (
            <View>
              <View style={styles.statusContainer}>
                <Icon
                  name="exclamation-circle"
                  size={24}
                  color="#FF9800"
                  style={styles.statusIcon}
                />
                <Text style={[styles.statusText, { color: '#FF9800' }]}>
                  Not Marked Yet
                </Text>
              </View>
              <TouchableOpacity
                style={styles.markAttendanceButton}
                onPress={() => navigation.navigate('MarkAttendance', {
                  userId: currentUser?.email?.toLowerCase(),
                  userName: user?.name,
                  email: currentUser?.email,
                  userData: user
                })}
              >
                <Icon name="clock" size={20} color="#ffffff" />
                <Text style={styles.markAttendanceText}>Mark Attendance</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const StatsCard = () => {
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.cardTitle}>Monthly Statistics ({new Date().toLocaleString('default', { month: 'long' })})</Text>
          {attendanceStats ? (
            <>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{attendanceStats.totalWorkingDays || 0}</Text>
                  <Text style={styles.statLabel}>Working Days</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                    {(attendanceStats.present || 0) + (attendanceStats.late || 0)}
                  </Text>
                  <Text style={styles.statLabel}>Present</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#F44336' }]}>{attendanceStats.absent || 0}</Text>
                  <Text style={styles.statLabel}>Absent</Text>
                </View>
              </View>
              <View style={styles.statsContainer}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: '#FF9800' }]}>{attendanceStats.late || 0}</Text>
                  <Text style={styles.statLabel}>Late Markings</Text>
                </View>
                <View style={[styles.statItem, { flex: 2 }]}>
                  <Text style={[styles.statValue,
                  { color: attendanceStats.percentage >= 75 ? '#4CAF50' : '#F44336' }]}>
                    {attendanceStats.percentage.toFixed(1)}%
                  </Text>
                  <Text style={styles.statLabel}>Attendance Rate</Text>
                </View>
              </View>
            </>
          ) : (
            <ActivityIndicator size="small" color="#1D3557" />
          )}
        </Card.Content>
      </Card>
    );
  };

  useEffect(() => {
    if (!currentUser?.email) {
      return;
    }

    const userEmail = currentUser.email.toLowerCase();
    console.log('[DEBUG] Fetching appointments for:', userEmail);

    // Get the document reference for the user's appointments
    const userAppointmentsDoc = doc(db, 'appointments', userEmail);

    const unsubscribe = onSnapshot(userAppointmentsDoc, (docSnapshot) => {
      if (!docSnapshot.exists()) {
        console.log('[DEBUG] No appointments document found for user');
        setUpcomingAppointments([]);
        return;
      }

      const data = docSnapshot.data();
      console.log('[DEBUG] Got appointments data:', data);

      // Get appointments array from the document
      const appointmentsList = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Convert appointments object to array and filter for today
      Object.entries(data).forEach(([id, appointment]) => {
        try {
          if (!appointment || !appointment.date) {
            console.log('[DEBUG] Skipping invalid appointment:', id);
            return;
          }

          // Parse the appointment date
          const [year, month, day] = appointment.date.split('-').map(Number);
          const appointmentDate = new Date(year, month - 1, day);
          appointmentDate.setHours(0, 0, 0, 0);

          console.log('[DEBUG] Comparing appointment dates:', {
            appointmentId: id,
            appointmentDate: appointmentDate.toISOString(),
            today: today.toISOString(),
            matches: appointmentDate.getTime() === today.getTime()
          });

          // Only add appointments for today
          if (appointmentDate.getTime() === today.getTime()) {
            console.log('[DEBUG] Found appointment for today:', {
              id,
              title: appointment.title,
              time: appointment.time
            });
            appointmentsList.push({
              id,
              ...appointment
            });
          }
        } catch (error) {
          console.error('[DEBUG] Error processing appointment:', error);
        }
      });

      // Sort appointments by time
      appointmentsList.sort((a, b) => {
        const timeA = new Date(`1970/01/01 ${a.time}`);
        const timeB = new Date(`1970/01/01 ${b.time}`);
        return timeA - timeB;
      });

      console.log('[DEBUG] Final filtered appointments:', {
        count: appointmentsList.length,
        appointments: appointmentsList.map(a => ({
          id: a.id,
          title: a.title,
          time: a.time,
          with: a.with
        }))
      });

      setUpcomingAppointments(appointmentsList);
    }, error => {
      console.error("[DEBUG] Error fetching appointments:", error);
      Alert.alert(
        "Error",
        "Failed to load appointments. Please try refreshing the dashboard."
      );
    });

    return () => unsubscribe();
  }, [currentUser?.email]);

  const renderAppointmentsSection = () => {
    console.log('[DEBUG] Rendering appointments section. Count:', upcomingAppointments?.length);

    const renderAppointment = (appointment) => {
      console.log('[DEBUG] Rendering appointment:', appointment.id);

      // Format time to 12-hour format
      const formatTime = (timeStr) => {
        try {
          const [hours, minutes] = timeStr.split(':');
          const date = new Date();
          date.setHours(parseInt(hours), parseInt(minutes));
          return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } catch (error) {
          return timeStr;
        }
      };

      // Get status color based on time
      const getStatusColor = () => {
        try {
          const [hours, minutes] = appointment.time.split(':');
          const appointmentTime = new Date();
          appointmentTime.setHours(parseInt(hours), parseInt(minutes));
          const now = new Date();

          if (appointmentTime < now) {
            return '#F94144'; // Past - Red
          } else if (appointmentTime.getTime() - now.getTime() <= 3600000) { // Within 1 hour
            return '#F3722C'; // Orange
          } else {
            return '#2EC4B6'; // Upcoming - Teal
          }
        } catch (error) {
          return '#2EC4B6'; // Default color
        }
      };

      const statusColor = getStatusColor();

      return (
        <TouchableOpacity
          key={appointment.id}
          style={[styles.appointmentCard, { borderLeftColor: statusColor }]}
          onPress={() => navigation.navigate('Appointments')}
          activeOpacity={0.7}
        >
          <View style={[styles.appointmentTimeStrip, { backgroundColor: `${statusColor}15` }]}>
            <Text style={[styles.appointmentTime, { color: statusColor }]}>{formatTime(appointment.time)}</Text>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          </View>
          <View style={styles.appointmentContent}>
            <View style={styles.appointmentHeader}>
              <Text style={styles.appointmentTitle} numberOfLines={1}>
                {appointment.title}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: `${statusColor}15` }]}>
                <Text style={[styles.statusText, { color: statusColor }]}>Upcoming</Text>
              </View>
            </View>
            
            <View style={styles.appointmentDetails}>
              {appointment.with && (
                <View style={styles.detailRow}>
                  <View style={[styles.iconContainer, { backgroundColor: '#E9ECEF' }]}>
                    <Icon name="user" size={12} color="#457B9D" />
                  </View>
                  <Text style={styles.detailText}>{appointment.with}</Text>
                </View>
              )}
              {appointment.place && (
                <View style={styles.detailRow}>
                  <View style={[styles.iconContainer, { backgroundColor: '#E9ECEF' }]}>
                    <Icon name="map-marker-alt" size={12} color="#457B9D" />
                  </View>
                  <Text style={styles.detailText}>{appointment.place}</Text>
                </View>
              )}
              {appointment.department && (
                <View style={styles.detailRow}>
                  <View style={[styles.iconContainer, { backgroundColor: '#E9ECEF' }]}>
                    <Icon name="building" size={12} color="#457B9D" />
                  </View>
                  <Text style={styles.detailText}>{appointment.department}</Text>
                </View>
              )}
            </View>

            {appointment.description && (
              <Text style={styles.appointmentDescription} numberOfLines={2}>
                {appointment.description}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      );
    };

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeaderContainer}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.iconBackground}>
              <Icon name="calendar-check" size={16} color="#1D3557" />
            </View>
            <Text style={styles.sectionTitle}>Today's Appointments</Text>
          </View>
          <TouchableOpacity 
            style={styles.viewAllButton}
            onPress={() => navigation.navigate('Appointments')}
          >
            <Text style={styles.viewAllText}>View All</Text>
            <Icon name="chevron-right" size={12} color="#457B9D" />
          </TouchableOpacity>
        </View>

        {upcomingAppointments && upcomingAppointments.length > 0 ? (
          <View style={styles.appointmentsContainer}>
            {upcomingAppointments.map(appointment => renderAppointment(appointment))}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.noAppointmentsCard}
            onPress={() => navigation.navigate('Appointments', { openScheduleForm: true })}
            activeOpacity={0.7}
          >
            <View style={styles.noAppointmentsContent}>
              <View style={styles.emptyStateIcon}>
                <Icon name="calendar-plus" size={32} color="#457B9D" />
              </View>
              <Text style={styles.noAppointmentsText}>No appointments scheduled for today</Text>
              <View style={styles.scheduleButton}>
                <Text style={styles.scheduleButtonText}>Schedule New</Text>
                <Icon name="plus" size={12} color="#1D3557" style={styles.scheduleButtonIcon} />
              </View>
            </View>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const handleAttendanceNavigation = () => {
    if (todayAttendance) {
      // If attendance is already marked, show alert with option to go to MarkAttendance for testing
      Alert.alert(
        "Attendance Already Marked",
        `Your attendance was marked at ${todayAttendance.timeStr}`,
        [
          {
            text: "OK",
            style: "cancel"
          },
          {
            text: "Go to MarkAttendance (Dev)",
            onPress: () => navigation.navigate('MarkAttendance', {
              userId: currentUser?.email?.toLowerCase(),
              userName: user?.name,
              email: currentUser?.email,
              userData: user
            })
          }
        ]
      );
    } else {
      // If attendance is not marked, navigate directly to MarkAttendance
      navigation.navigate('MarkAttendance', {
        userId: currentUser?.email?.toLowerCase(),
        userName: user?.name,
        email: currentUser?.email,
        userData: user
      });
    }
  };

  // Remove the auto-refresh countdown display
  const getRefreshCountdown = () => {
    return "Auto-refresh disabled";
  };

  // Add this function to check location permissions
  const checkLocationPermission = async () => {
    if (!currentUser?.email || !['staff', 'admin'].includes(user?.role?.toLowerCase())) {
      return;
    }

    try {
      const foreground = await Location.getForegroundPermissionsAsync();
      const background = await Location.getBackgroundPermissionsAsync();
      const services = await Location.hasServicesEnabledAsync();

      if (foreground.status === 'granted' && 
          background.status === 'granted' && 
          services) {
        setNeedsLocationPermission(false);
        await AsyncStorage.setItem('userEmail', currentUser.email.toLowerCase());
        await startLocationTracking(true);
      } else {
        setNeedsLocationPermission(true);
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
      setNeedsLocationPermission(true);
    }
  };

  // Add this function to handle permission granted
  const handleLocationPermissionGranted = async () => {
    try {
      setNeedsLocationPermission(false);
      if (currentUser?.email) {
        await AsyncStorage.setItem('userEmail', currentUser.email.toLowerCase());
        await startLocationTracking(true);
        // Force a refresh of the dashboard data
        await refreshData();
      }
    } catch (error) {
      console.error('[DEBUG] Error in handleLocationPermissionGranted:', error);
    }
  };

  // Add this check at the beginning of your render
  if (needsLocationPermission && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
    return (
      <LocationPermissionScreen 
        onPermissionGranted={handleLocationPermissionGranted} 
      />
    );
  }

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(blinkAnim, {
          toValue: 0,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
        Animated.timing(blinkAnim, {
          toValue: 1,
          duration: 500,
          easing: Easing.step0,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [blinkAnim]);

  return (
    <SafeAreaView style={styles.safeArea}>
      {user ? (
        <>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.welcomeText}>Welcome back,</Text>
              <Text style={styles.greeting}>{user?.name || "User"}</Text>
              <Text style={styles.role}>
                {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "User"}
              </Text>
            </View>
            <View style={styles.headerRightContainer}>
              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => navigation.navigate("Profile", {
                  userData: user,
                  userId: currentUser?.uid,
                  name: user?.name,
                  email: user?.email,
                  role: user?.role,
                  phoneNumber: user?.phoneNumber,
                  department: user?.department,
                  profilePhoto: user?.profilePhoto,
                  id: user?.id,
                  accessLevel: user?.accessLevel,
                  bio: user?.bio,
                  emergencyContact: user?.emergencyContact,
                  qualifications: user?.qualifications
                })}
              >
                {user?.profilePhoto ? (
                  <Image
                    source={{ uri: user.profilePhoto }}
                    style={styles.profileImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Icon name="user-circle" size={28} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Content */}
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollViewContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={refreshData}
                colors={["#74C69D"]}
                tintColor="#74C69D"
                title="Pull to refresh"
                titleColor="#1D3557"
              />
            }
          >
            {/* Show attendance cards for staff and admin */}
            {shouldShowAttendance() && (
              <>
                <AttendanceCard />
                <StatsCard />
              </>
            )}

            <View style={styles.updateStatusContainer}>
              <View style={styles.refreshInfo}>
                <Text style={styles.lastUpdatedText}>
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </Text>
                <Text style={styles.nextUpdateText}>
                  Pull down to refresh
                </Text>
              </View>
              <TouchableOpacity
                style={styles.manualRefreshButton}
                onPress={refreshData}
                disabled={refreshing}
              >
                <Icon
                  name={refreshing ? "spinner" : "sync"}
                  size={16}
                  color="#457B9D"
                  style={[
                    styles.refreshIcon,
                    refreshing && styles.spinningIcon
                  ]}
                />
              </TouchableOpacity>
            </View>

            {/* Quick Actions Grid */}
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {getQuickActions().map((action, index, array) => {
                const isSuperAdmin = user?.accessLevel?.toLowerCase() === 'super admin' || 
                                  user?.email === 'kathipallimadhu@gmail.com';
                
                if (action.superAdminOnly && !isSuperAdmin) {
                  return null;
                }

                // Calculate if this is in the last row
                const totalVisibleActions = array.filter(a => !(a.superAdminOnly && !isSuperAdmin)).length;
                const itemsPerRow = 2; // Since we're using 48% width, we get 2 items per row
                const isInLastRow = Math.floor(index / itemsPerRow) === Math.floor((totalVisibleActions - 1) / itemsPerRow);

                return (
                  <TouchableOpacity
                    key={`${action.id}-${Date.now()}`}
                    style={[
                      styles.actionCard,
                      { backgroundColor: action.bgColor },
                      isInLastRow && styles.lastRowCard
                    ]}
                    onPress={() => {
                      if (action.route === 'UserAccessManagement') {
                        navigation.navigate(action.route, {
                          key: `UserAccess-${Date.now()}`,
                          userAccess: user.accessLevel || 'Basic Admin'
                        });
                      } else if (action.route === 'MarkAttendance') {
                        handleAttendanceNavigation();
                      } else {
                        navigation.navigate(action.route, action.params);
                      }
                    }}
                  >
                    <Icon name={action.icon} size={24} color="#fff" />
                    <Text style={styles.actionText}>{action.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Today's Tasks Section */}
            <TouchableOpacity 
              style={styles.sectionHeader}
              onPress={() => navigation.navigate('MyTasksScreen')}
            >
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
              <Text style={styles.taskCountBadge}>{todayTasks.length} tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.tasksContainer}
              onPress={() => navigation.navigate('MyTasksScreen')}
            >
              {todayTasks.length > 0 ? (
                todayTasks.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.taskItem,
                      item.completed && styles.completedTaskItem
                    ]}
                  >
                    <TouchableOpacity 
                      style={styles.taskCheckbox}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleTaskCompletion(item.id);
                      }}
                    >
                      <Icon
                        name={item.completed ? "check-circle" : "circle"}
                        size={20}
                        color={item.completed ? "#74C69D" : "#adb5bd"}
                      />
                    </TouchableOpacity>
                    <View style={styles.taskDetails}>
                      <Text
                        style={[
                          styles.taskText,
                          item.completed && styles.completedTaskText,
                        ]}
                      >
                        {item.title}
                      </Text>
                      {item.description && (
                        <Text style={styles.taskDescription}>{item.description}</Text>
                      )}
                      {item.deadline && (
                        <View style={styles.taskTimeContainer}>
                          <Icon name="clock" size={12} color="#6c757d" />
                          <Text style={styles.taskTime}>
                            {formatDate(item.deadline)} • {formatTime(item.deadline)}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={[
                      styles.taskPriority,
                      item.priority === 'high' && styles.highPriority,
                      item.priority === 'medium' && styles.mediumPriority,
                      item.priority === 'low' && styles.lowPriority,
                    ]}>
                      <Text style={styles.priorityText}>
                        {item.priority?.charAt(0).toUpperCase() + item.priority?.slice(1)}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noTasksContainer}>
                  <Icon name="tasks" size={40} color="#adb5bd" />
                  <Text style={styles.noTasksText}>No tasks for today</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Appointments Section */}
            {renderAppointmentsSection()}
          </ScrollView>
        </>
      ) : (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Animated.View style={{ opacity: blinkAnim, alignItems: 'center' }}>
            <Image
              source={require('../../assets/college-logo.png')}
              style={{
                width: 150,
                height: 150,
                resizeMode: 'contain'
              }}
            />
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: '4%',
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: '4%',
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    minHeight: Platform.OS === 'ios' ? 120 : 140,
    backgroundColor: "#1D3557",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
  },
  welcomeText: {
    fontSize: Platform.OS === 'ios' ? 14 : 16,
    color: "#A8DADC",
    marginBottom: 4,
  },
  greeting: {
    fontSize: Platform.OS === 'ios' ? 22 : 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  role: {
    fontSize: Platform.OS === 'ios' ? 14 : 16,
    color: "#E9ECEF",
    opacity: 0.9,
  },
  profileButton: {
    width: Platform.OS === 'ios' ? 46 : 52,
    height: Platform.OS === 'ios' ? 46 : 52,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#fff',  
  },
  container: {
    marginBottom: 20,
  },
  card: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 12,
    marginHorizontal: '1%',
  },
  cardTitle: {
    fontSize: Platform.OS === 'ios' ? 16 : 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#1D3557',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusIcon: {
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  confidenceText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  lastUpdatedText: {
    fontSize: 12,
    color: "#6c757d",
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
    marginTop: 0,  // Add this to remove any top margin
  },
  sectionTitle: {
    fontSize: Platform.OS === 'ios' ? 16 : 18,
    fontWeight: "700",
    color: "#1D3557",
    marginBottom: 5,
  },
  taskCountBadge: {
    backgroundColor: '#E9ECEF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 12,
    color: '#6c757d',
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 0,
    paddingBottom: 0,
    paddingTop: 0,
  },
  actionCard: {
    width: '48%',
    aspectRatio: 1.6,
    borderRadius: 10,
    padding: '1%',
    marginBottom: '1%',
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  lastRowCard: {
    marginBottom: 0,
  },
  actionText: {
    color: "#fff",
    fontSize: Platform.OS === 'ios' ? 12 : 13,
    marginTop: 4,
    fontWeight: "600",
    textAlign: "center",
  },
  tasksContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: '4%',
    elevation: 2,
    marginBottom: 20,
    marginTop: 0, 
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    padding: '3%',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  completedTaskItem: {
    backgroundColor: '#f8f9fa',
  },
  taskCheckbox: {
    marginRight: 10,
  },
  taskDetails: {
    flex: 1,
  },
  taskText: {
    fontSize: Platform.OS === 'ios' ? 14 : 16,
    color: "#1D3557",
    fontWeight: "500",
    flexShrink: 1,
  },
  taskDescription: {
    fontSize: Platform.OS === 'ios' ? 12 : 14,
    color: '#6c757d',
    marginTop: 4,
    flexShrink: 1,
  },
  completedTaskText: {
    textDecorationLine: "line-through",
    color: "#6c757d",
  },
  taskTimeContainer: {
    flexDirection: "row",
    alignItems: 'center',
    marginTop: 6,
  },
  taskTime: {
    fontSize: 12,
    color: "#6c757d",
    marginLeft: 5,
  },
  taskPriority: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 10,
  },
  highPriority: {
    backgroundColor: '#F94144',
  },
  mediumPriority: {
    backgroundColor: '#F8961E',
  },
  lowPriority: {
    backgroundColor: '#90BE6D',
  },
  priorityText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  noTasksContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  noTasksText: {
    textAlign: "center",
    color: "#6c757d",
    fontSize: 14,
    marginTop: 10,
  },
  horizontalScroll: {
    marginBottom: 20,
    marginTop: 10,
  },
  announcementCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: '4%',
    marginRight: 15,
    width: 280,
    elevation: 2,
  },
  announcementTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1D3557",
  },
  announcementMeta: {
    marginTop: 5,
    color: "#6c757d",
    fontSize: 12,
  },
  eventsContainer: {
    marginBottom: 30,
  },
  eventCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: '4%',
    marginBottom: 15,
    elevation: 2,
  },
  eventIcon: {
    marginRight: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1D3557",
  },
  eventInfo: {
    color: "#6c757d",
    fontSize: 13,
    marginTop: 2,
  },
  loadingText: {
    fontSize: 16,
    color: "#1D3557",
    marginTop: 20,
  },
  sectionContainer: {
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBackground: {
    backgroundColor: '#F1FAEE',
    padding: 8,
    borderRadius: 8,
    marginRight: 8,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  viewAllText: {
    color: '#457B9D',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 4,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    flexDirection: 'row',
    overflow: 'hidden',
    borderLeftWidth: 4,
  },
  appointmentTimeStrip: {
    width: 80,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appointmentTime: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  appointmentContent: {
    flex: 1,
    padding: 12,
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  appointmentDetails: {
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  iconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  detailText: {
    fontSize: 14,
    color: '#457B9D',
    flex: 1,
  },
  appointmentDescription: {
    fontSize: 13,
    color: '#6C757D',
    fontStyle: 'italic',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
  },
  noAppointmentsCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  noAppointmentsContent: {
    alignItems: 'center',
    padding: 16,
  },
  emptyStateIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1FAEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  noAppointmentsText: {
    fontSize: 14,
    color: '#6C757D',
    marginBottom: 16,
    textAlign: 'center',
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1FAEE',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  scheduleButtonText: {
    color: '#1D3557',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  scheduleButtonIcon: {
    marginLeft: 4,
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  updateStatusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 4,
  },
  autoRefreshStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  attendanceDetails: {
    marginTop: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: '4%',
  },
  detailIcon: {
    marginRight: 12,
    width: 16,
  },
  detailTexts: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  detailLabel: {
    fontSize: Platform.OS === 'ios' ? 12 : 14,
    color: '#6C757D',
    flex: 1,
    marginRight: 8,
  },
  detailValue: {
    fontSize: Platform.OS === 'ios' ? 12 : 14,
    color: '#1D3557',
    fontWeight: '500',
    flex: 2,
  },
  refreshInfo: {
    flex: 1,
  },
  nextUpdateText: {
    fontSize: 11,
    color: "#457B9D",
    marginTop: 2,
  },
  manualRefreshButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
  },
  refreshIcon: {
    opacity: 0.8,
  },
  spinningIcon: {
    opacity: 0.5,
  },
  markAttendanceButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  markAttendanceText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default DashboardScreen;