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
} from "firebase/firestore";
import { useNavigation, useRoute, useFocusEffect } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from 'react-native-paper';
import { fetchUser } from "../../services/Firebase/firestoreService";
import firebase from "firebase/app";
import * as Location from 'expo-location';
import { startLocationTracking, stopLocationTracking } from "../../services/LocationService";

const DashboardScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
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

  // Static announcements and events
  const [announcements] = useState([
    { id: "1", title: "Staff meeting at 2 PM", time: "10 mins ago", department: "All", forRoles: ["admin", "staff"] },
    { id: "2", title: "Deadline for reports submission", time: "1 hour ago", department: "Academic", forRoles: ["admin", "staff"] },
    { id: "3", title: "System training session", time: "Yesterday", department: "IT", forRoles: ["admin", "staff"] },
    { id: "4", title: "Exam Schedule Released", time: "2 hours ago", department: "Academic", forRoles: ["student"] },
    { id: "5", title: "Library Hours Extended", time: "Yesterday", department: "Library", forRoles: ["student"] },
    { id: "6", title: "Sports Day Registration", time: "3 hours ago", department: "Sports", forRoles: ["student"] },
  ]);

  const [upcomingEvents] = useState([
    { id: "1", title: "Monthly review", date: "Tomorrow, 10:00 AM", location: "Conference Room A", forRoles: ["admin", "staff"] },
    { id: "2", title: "Parent-Teacher meeting", date: "Friday, 2:00 PM", location: "Main Hall", forRoles: ["admin", "staff", "student"] },
    { id: "3", title: "Cultural Event", date: "Saturday, 3:00 PM", location: "Auditorium", forRoles: ["student"] },
    { id: "4", title: "Career Counseling", date: "Next Monday, 11:00 AM", location: "Seminar Hall", forRoles: ["student"] },
  ]);

  const staffQuickActions = [
    { id: "1", label: "Mark Attendance", icon: "clipboard-check", bgColor: "#FF9F1C", route: "MarkAttendance" },
    { id: "2", label: "ID Card", icon: "id-card", bgColor: "#3A86FF", route: "DigitalIDCard", params: { userData: user } },
    { id: "3", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "4", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "5", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "6", label: "Notices", icon: "bell", bgColor: "#90BE6D", route: "Notices" },
    { id: "7", label: "Track Location", icon: "map-marker-alt", bgColor: "#D00000", route: "ViewLocations" },
  ];

  const adminQuickActions = [
    { id: "1", label: "Mark Attendance", icon: "clipboard-check", bgColor: "#F94144", route: "MarkAttendance" },
    { id: "2", label: "ID Card", icon: "id-card", bgColor: "#3A86FF", route: "DigitalIDCard", params: { userData: user } },
    { id: "3", label: "User Access", icon: "user-shield", bgColor: "#FF9F1C", route: "UserAccessManagement" },
    { id: "4", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "5", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "6", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "7", label: "Notices", icon: "bell", bgColor: "#90BE6D", route: "Notices" },
    { id: "8", label: "Track Staff", icon: "map-marked-alt", bgColor: "#D00000", route: "ViewLocations" },
    { id: "9", label: "Attendance Settings", icon: "clock", bgColor: "#6C757D", route: "AttendanceSettings", superAdminOnly: true },
  ];

  const studentQuickActions = [
    { id: "1", label: "ID Card", icon: "id-card", bgColor: "#3A86FF", route: "DigitalIDCard", params: { userData: user } },
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
          setUser({
            ...userData,
            accessLevel: isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userData.role || 'student')
          });
        }

        // Load attendance data if needed
        if (userData?.role === 'staff' || userData?.role === 'admin' || userData?.accessLevel?.includes('admin')) {
          await loadAttendanceData();
        }

        dataFetchedRef.current = true;
      } catch (error) {
        console.error("Error initializing data:", error);
      }
    };

    initializeData();
  }, [currentUser?.email]);

  // Tasks subscription effect - only start after user data is loaded
  useEffect(() => {
    if (!currentUser?.uid || !user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasksQuery = query(
      collection(db, "facultyTasks"),
      where("facultyId", "==", currentUser.uid),
      orderBy("deadline", "asc")
    );

    const unsubscribe = onSnapshot(tasksQuery, (querySnapshot) => {
      const allTasks = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        let deadline = null;
        if (data.deadline) {
          deadline = typeof data.deadline === 'string' ? new Date(data.deadline) : data.deadline.toDate();
        }

        return {
          id: doc.id,
          ...data,
          deadline: deadline,
          completed: data.status === "completed"
        };
      });

      const tasksData = allTasks.filter(task => {
        if (!task.deadline) return false;
        const taskDate = new Date(task.deadline);
        taskDate.setHours(0, 0, 0, 0);
        return taskDate >= today && taskDate < tomorrow;
      });

      setTodayTasks(tasksData);
      setLastUpdated(new Date());
    });

    return () => unsubscribe();
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
    const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;

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
      
      // Get monthly attendance records first
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

      monthlyDocs.forEach(doc => {
        const data = doc.data();
        
        // Check if this record is for today
        if (data.dateStr === dateStr) {
          setTodayAttendance(data);
          todayAttendanceFound = true;
        }

        totalWorkingDays++;
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
          // Check if marked late (after 9:30 AM)
          if (data.timeStr) {
            const timeStr = data.timeStr.split(' ')[0]; // Remove AM/PM
            const [hours, minutes] = timeStr.split(':').map(Number);
            const isPM = data.timeStr.toLowerCase().includes('pm');
            let hour24 = hours;
            
            if (isPM && hours !== 12) {
              hour24 = hours + 12;
            } else if (!isPM && hours === 12) {
              hour24 = 0;
            }

            if (hour24 > 9 || (hour24 === 9 && minutes > 30)) {
              lateCount++;
            }
          }
        } else {
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
        percentage: totalWorkingDays > 0 ? (presentCount / totalWorkingDays) * 100 : 0,
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

        if (!user || !['staff', 'admin'].includes(user?.role?.toLowerCase())) {
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

        if (prevState === 'background' && nextAppState === 'active') {
          // Restart location tracking if user is authorized
          if (currentUser?.email && ['staff', 'admin'].includes(user?.role?.toLowerCase())) {
            await AsyncStorage.setItem('userEmail', currentUser.email.toLowerCase());
            await startLocationTracking(true);
          }
        }
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
      userRole.includes('admin') ||
      userAccess.includes('admin')
    );
  };

  // Update the quick actions section
  const getQuickActions = () => {
    const userRole = user?.role?.toLowerCase() || '';
    const userAccess = user?.accessLevel?.toLowerCase() || '';
    const isSuperAdmin = userAccess.includes('super admin') || user?.email === 'kathipallimadhu@gmail.com';
    
    if (userAccess.includes('admin') || userRole === 'admin' || userRole.includes('admin')) {
      return adminQuickActions.filter(action => !action.superAdminOnly || isSuperAdmin);
    } else if (userRole === 'staff') {
      return staffQuickActions;
    } else {
      return studentQuickActions;
    }
  };

  const toggleTaskCompletion = async (taskId) => {
    try {
      const taskToUpdate = todayTasks.find(task => task.id === taskId);
      if (!taskToUpdate) return;

      const newStatus = taskToUpdate.status === "completed" ? "pending" : "completed";
      
      await updateDoc(doc(db, "facultyTasks", taskId), {
        status: newStatus,
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error updating task:", error);
      Alert.alert("Error", "Failed to update task status.");
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
                <Text style={styles.markAttendanceText}>Mark Attendance</Text>
              </TouchableOpacity>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const StatsCard = () => {
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

    const getStatusDisplay = (record) => {
      if (record.status === 'Late') {
        return {
          text: 'Present (Late)',
          color: '#FF9800'
        };
      }
      return {
        text: record.status,
        color: record.status === 'Present' ? '#4CAF50' : '#F44336'
      };
    };

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
              
              {/* Daily Records Summary */}
              <View style={styles.dailyRecordsContainer}>
                <Text style={styles.dailyRecordsTitle}>Recent Records</Text>
                {attendanceStats.dailyRecords?.slice(-5).map((record, index) => {
                  const status = getStatusDisplay(record);
                  return (
                    <View key={index} style={styles.recordItem}>
                      <View style={styles.recordDate}>
                        <Text style={styles.recordDay}>{record.dayName}</Text>
                        <Text style={styles.recordDateText}>{record.dateStr}</Text>
                      </View>
                      <View style={styles.recordDetails}>
                        <Text style={[styles.recordStatus, { color: status.color }]}>
                          {status.text}
                        </Text>
                        {record.time && (
                          <Text style={[
                            styles.recordTime,
                            record.isLate && { color: '#FF9800' }
                          ]}>
                            {formatTime(record.time)}
                          </Text>
                        )}
                      </View>
                      {record.verificationStatus && (
                        <Text style={styles.recordVerification}>
                          {record.verificationStatus}
                        </Text>
                      )}
                    </View>
                  );
                })}
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

    const unsubscribe = db.collection('appointments')
      .doc(userEmail)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data();
          const appointmentsList = [];
          
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);

          Object.entries(data).forEach(([title, appointment]) => {
            try {
              const [year, month, day] = appointment.date.split('-');
              const appointmentDate = new Date(year, month - 1, day);
              appointmentDate.setHours(0, 0, 0, 0);

              if (appointmentDate.getTime() === today.getTime()) {
                appointmentsList.push({
                  id: title,
                  ...appointment
                });
              }
            } catch (error) {
              console.error("Error processing appointment:", title, error);
            }
          });
          
          appointmentsList.sort((a, b) => {
            const timeA = new Date('1970/01/01 ' + a.time);
            const timeB = new Date('1970/01/01 ' + b.time);
            return timeA - timeB;
          });
          
          setUpcomingAppointments(appointmentsList);
        } else {
          setUpcomingAppointments([]);
        }
      }, error => {
        console.error("Error fetching appointments:", error);
        Alert.alert("Error", "Failed to load appointments");
      });

    return () => unsubscribe();
  }, [currentUser?.email]);

  const renderAppointmentsSection = () => {
    
    const renderAppointment = (appointment) => (
      <Card key={appointment.id} style={styles.appointmentCard}>
        <Card.Content>
          <View style={styles.appointmentHeader}>
            <View style={styles.appointmentInfo}>
              <Text style={styles.appointmentTitle}>{appointment.title}</Text>
              <Text style={styles.appointmentWith}>With: {appointment.with}</Text>
              <Text style={styles.appointmentDetail}>Place: {appointment.place}</Text>
              <Text style={styles.appointmentDetail}>Department: {appointment.department}</Text>
              {appointment.description && (
                <Text style={styles.appointmentDescription}>{appointment.description}</Text>
              )}
            </View>
            <View style={styles.appointmentStatus}>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>Upcoming</Text>
              </View>
              <Text style={styles.appointmentDate}>{appointment.date}</Text>
              <Text style={styles.appointmentTime}>{appointment.time}</Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );

    return (
      <View style={styles.sectionContainer}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Appointments')}>
            <Text style={styles.viewAllText}>View All</Text>
          </TouchableOpacity>
        </View>
        
        {upcomingAppointments && upcomingAppointments.length > 0 ? (
          <View>
            {upcomingAppointments.map(appointment => renderAppointment(appointment))}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.noAppointmentsCard}
            onPress={() => navigation.navigate('Appointments', { openScheduleForm: true })}
          >
            <View style={styles.noAppointmentsContent}>
              <Icon name="calendar-plus" size={40} color="#adb5bd" />
              <Text style={styles.noAppointmentsText}>No upcoming appointments</Text>
              <View style={styles.scheduleButton}>
                <Text style={styles.scheduleButtonText}>Tap to schedule one</Text>
                <Icon name="arrow-right" size={14} color="#1D3557" style={styles.arrowIcon} />
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
              {getQuickActions().map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[styles.actionCard, { backgroundColor: action.bgColor }]}
                  onPress={() => {
                    if (action.route === 'UserAccessManagement') {
                      navigation.navigate(action.route, {
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
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
              <Text style={styles.taskCountBadge}>{todayTasks.length} tasks</Text>
            </View>
            <View style={styles.tasksContainer}>
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
                      onPress={() => toggleTaskCompletion(item.id)}
                      style={styles.taskCheckbox}
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
            </View>
            
            {renderAppointmentsSection()}

            {/* Announcements */}
            <Text style={styles.sectionTitle}>Announcements</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled={true}
              style={styles.horizontalScroll}
            >
              {announcements
                .filter(item => item.forRoles.includes(user?.role?.toLowerCase() || 'student'))
                .map((item) => (
                  <View key={item.id} style={styles.announcementCard}>
                    <Text style={styles.announcementTitle}>{item.title}</Text>
                    <Text style={styles.announcementMeta}>
                      {item.department} • {item.time}
                    </Text>
                  </View>
                ))}
            </ScrollView>

            {/* Upcoming Events */}
            <Text style={styles.sectionTitle}>Upcoming Events</Text>
            <View style={styles.eventsContainer}>
              {upcomingEvents
                .filter(event => event.forRoles.includes(user?.role?.toLowerCase() || 'student'))
                .map((event) => (
                  <View key={event.id} style={styles.eventCard}>
                    <View style={styles.eventIcon}>
                      <Icon name="calendar-day" size={20} color="#1D3557" />
                    </View>
                    <View style={styles.eventDetails}>
                      <Text style={styles.eventTitle}>{event.title}</Text>
                      <Text style={styles.eventInfo}>{event.date}</Text>
                      <Text style={styles.eventInfo}>{event.location}</Text>
                    </View>
                  </View>
                ))}
            </View>
          </ScrollView>
        </>
      ) : (
        <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ fontSize: 16, color: '#1D3557' }}>Loading user data...</Text>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 40,
    height: 140,
    backgroundColor: "#1D3557",
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 5,
  },
  welcomeText: {
    fontSize: 16,
    color: "#A8DADC",
    marginBottom: 4,
  },
  greeting: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
    marginBottom: 4,
  },
  role: {
    fontSize: 16,
    color: "#E9ECEF",
    opacity: 0.9,
  },
  profileButton: {
    padding: 8,
    borderRadius: 30,
    width:52,
    height:52,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fff',

  },
  profileImage: {
    width: 52,
    height: 52,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#fff',
  },
  container: {
    marginBottom: 20,
  },
  card: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 18,
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
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1D3557",
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
    marginBottom: 20,
  },
  actionCard: {
    width: "48%",
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    alignItems: "center",
    justifyContent: "center",
    elevation: 2,
  },
  actionText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 8,
    fontWeight: "600",
    textAlign: "center",
  },
  tasksContainer: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    elevation: 2,
    marginBottom: 20,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    padding: 10,
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
    fontSize: 16,
    color: "#1D3557",
    fontWeight: "500",
  },
  taskDescription: {
    fontSize: 14,
    color: '#6c757d',
    marginTop: 4,
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
  },
  announcementCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 15,
    marginRight: 15,
    width: 220,
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
    padding: 15,
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
  },
  viewAllText: {
    color: '#457B9D',
    fontSize: 14,
    fontWeight: '600',
  },
  appointmentCard: {
    marginBottom: 16,
    elevation: 3,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderLeftWidth: 5,
    borderLeftColor: '#2EC4B6',
  },
  appointmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  appointmentInfo: {
    flex: 1,
    marginRight: 16,
  },
  appointmentStatus: {
    alignItems: 'flex-end',
  },
  appointmentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 4,
  },
  appointmentWith: {
    fontSize: 16,
    color: '#457B9D',
    marginBottom: 4,
  },
  appointmentDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  appointmentDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    fontStyle: 'italic',
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#ddd',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#2EC4B6',
  },
  appointmentDate: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  appointmentTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  noAppointmentsCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    elevation: 2,
  },
  noAppointmentsContent: {
    alignItems: 'center',
    padding: 20,
  },
  noAppointmentsText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    marginBottom: 8,
  },
  scheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E9ECEF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 8,
  },
  scheduleButtonText: {
    color: '#1D3557',
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  arrowIcon: {
    marginLeft: 4,
  },
  markAttendanceButton: {
    backgroundColor: '#1D3557',
    padding: 10,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  markAttendanceText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  dailyRecordsContainer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    paddingTop: 12,
  },
  dailyRecordsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 8,
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  recordDate: {
    width: 120,
  },
  recordDay: {
    fontSize: 14,
    color: '#1D3557',
    fontWeight: '500',
  },
  recordDateText: {
    fontSize: 12,
    color: '#6c757d',
  },
  recordDetails: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  recordStatus: {
    fontSize: 14,
    fontWeight: '600',
  },
  recordTime: {
    fontSize: 12,
    color: '#457B9D',
    fontWeight: '500',
  },
  recordVerification: {
    fontSize: 11,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  headerRightContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshToggle: {
    padding: 8,
    marginRight: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
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
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
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
  },
  detailLabel: {
    fontSize: 14,
    color: '#6C757D',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
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
});

export default DashboardScreen;