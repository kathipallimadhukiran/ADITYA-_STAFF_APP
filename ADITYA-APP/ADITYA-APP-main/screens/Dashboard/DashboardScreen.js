import React, { useState, useEffect } from "react";
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
} from "firebase/firestore";
import { useNavigation, useRoute } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Card } from 'react-native-paper';
import { fetchUser } from "../../services/Firebase/firestoreService";

const DashboardScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [user, setUser] = useState(route.params?.user || null);
  const [refreshing, setRefreshing] = useState(false);
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [attendanceStats, setAttendanceStats] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const auth = getAuth();
  const currentUser = auth?.currentUser;

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
    { id: "2", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "FacultyTasksScreen" },
    { id: "3", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "4", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "5", label: "Messages", icon: "envelope", bgColor: "#90BE6D", route: "Messages" },
    { id: "6", label: "Track Location", icon: "map-marker-alt", bgColor: "#D00000", route: "TrackLocation" },
  ];

  const adminQuickActions = [
    { id: "3", label: "Mark Attendance", icon: "clipboard-check", bgColor: "#F94144", route: "MarkAttendance" },
    { id: "1", label: "User Access", icon: "user-shield", bgColor: "#FF9F1C", route: "UserAccessManagement" },
    { id: "2", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "4", label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },
    { id: "5", label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },
    { id: "6", label: "Messages", icon: "envelope", bgColor: "#90BE6D", route: "Messages" },
    { id: "7", label: "Track Staff", icon: "map-marked-alt", bgColor: "#D00000", route: "StaffLocationTracker" },
  ];

  const studentQuickActions = [
    { id: "1", label: "ID Card", icon: "id-card", bgColor: "#3A86FF", route: "DigitalIDCard" },
    { id: "3", label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "MyTasksScreen" },
    { id: "2", label: "Class Schedule", icon: "calendar-alt", bgColor: "#2EC4B6", route: "ViewSchedule" },
    { id: "4", label: "Results", icon: "chart-bar", bgColor: "#F3722C", route: "Results" },
    { id: "5", label: "Messages", icon: "envelope", bgColor: "#90BE6D", route: "Messages" },
    { id: "6", label: "Track Staff", icon: "map-marked-alt", bgColor: "#D00000", route: "StaffLocationTracker" },

  ];

  useEffect(() => {
    const loadUserData = async () => {
      if (!currentUser?.email) {
        console.log("No current user email available");
        navigation.navigate('Login');
        return;
      }

      try {
        const userData = await fetchUser(currentUser.email);
        console.log("Loaded user data:", userData); // Debug log
        if (userData) {
          // Check if the user is a super admin
          const isUserSuperAdmin = userData.email === 'kathipallimadhu@gmail.com' || userData.accessLevel === 'Super Admin';
          setUser({
            ...userData,
            accessLevel: isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userData.role || 'student')
          });
          console.log("User access level set to:", isUserSuperAdmin ? 'Super Admin' : (userData.accessLevel || userData.role || 'student')); // Debug log
          setLoading(false);
        } else {
          console.log("No user data found");
          Alert.alert("Error", "Failed to load user data");
          setLoading(false);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Error", "Failed to load user data");
        setLoading(false);
      }
    };

    if (!user) {
      loadUserData();
    }
  }, [currentUser, navigation]);

  useEffect(() => {
    if (!auth || !currentUser?.uid) {
      console.log("No current user UID available");
      navigation.navigate('Login');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log("Setting up Firestore listener for faculty tasks...");
    console.log("Today range:", today, "to", tomorrow);

    const tasksQuery = query(
      collection(db, "facultyTasks"),
      where("facultyId", "==", currentUser.uid),
      orderBy("deadline", "asc")
    );

    const unsubscribe = onSnapshot(tasksQuery, (querySnapshot) => {
      console.log("Received snapshot with", querySnapshot.docs.length, "documents");
      
      let completedCount = 0;
      let pendingCount = 0;
      
      const allTasks = querySnapshot.docs.map((doc) => {
        const data = doc.data();
        console.log("Raw task data:", data);
        
        let deadline = null;
        if (data.deadline) {
          if (typeof data.deadline === 'string') {
            deadline = new Date(data.deadline);
          } else if (data.deadline.toDate) {
            deadline = data.deadline.toDate();
          }
        }
        console.log("Processed deadline:", deadline);

        if (data.status === "completed") completedCount++;
        else pendingCount++;

        return {
          id: doc.id,
          ...data,
          deadline: deadline,
          completed: data.status === "completed"
        };
      });

      console.log("All tasks before filtering:", allTasks);

      const tasksData = allTasks.filter(task => {
        if (!task.deadline) {
          console.log("Task filtered out - no deadline:", task.id);
          return false;
        }
        
        const taskDate = new Date(task.deadline);
        taskDate.setHours(0, 0, 0, 0);
        const isToday = taskDate >= today && taskDate < tomorrow;
        
        if (!isToday) {
          console.log("Task filtered out - not for today:", task.id, "with date", taskDate);
        }
        
        return isToday;
      });

      console.log("Filtered tasks for today:", tasksData);

      setTodayTasks(tasksData);
    
      setLastUpdated(new Date());
      setLoading(false);
    }, (error) => {
      console.error("Error in tasks query:", error);
      Alert.alert("Error", "Failed to load tasks. Please try again.");
      setLoading(false);
    });

    return () => {
      console.log("Cleaning up tasks listener");
      unsubscribe();
    };
  }, [auth, currentUser]);

  useEffect(() => {
    const loadAttendanceData = async () => {
      try {
        const auth = getAuth();
        if (!auth?.currentUser?.uid) {
          console.error("No user logged in");
          navigation.navigate('Login');
          return;
        }

        const userId = auth.currentUser.uid;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get today's attendance
        const todaySnapshot = await db.collection('attendance')
          .where('userId', '==', userId)
          .where('date', '>=', today)
          .limit(1)
          .get();

        if (!todaySnapshot.empty) {
          setTodayAttendance(todaySnapshot.docs[0].data());
        }

        // Get monthly stats
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const monthlySnapshot = await db.collection('attendance')
          .where('userId', '==', userId)
          .where('date', '>=', startOfMonth)
          .get();

        const stats = {
          totalDays: monthlySnapshot.size,
          present: monthlySnapshot.docs.filter(doc => doc.data().status === 'Present').length,
        };
        stats.percentage = (stats.present / (stats.totalDays || 1)) * 100;

        setAttendanceStats(stats);
        setLoading(false);
      } catch (error) {
        console.error("Error loading attendance data:", error);
        Alert.alert("Error", "Failed to load attendance data");
        setLoading(false);
      }
    };

    loadAttendanceData();
    
    // Refresh when coming back to dashboard
    if (route.params?.refresh) {
      loadAttendanceData();
    }
  }, [route.params?.refresh]);

  useEffect(() => {
    if (!currentUser?.email) {
      console.log("No user email available for fetching appointments");
      return;
    }

    console.log("Fetching appointments for:", currentUser.email);

    const unsubscribe = db.collection('appointments')
      .doc(currentUser.email)
      .onSnapshot(
        doc => {
          console.log("Appointments document exists:", doc.exists);
          console.log("Raw appointments data:", doc.data());
          
          if (doc.exists) {
            const data = doc.data();
            const appointmentsList = [];
            
            Object.entries(data).forEach(([title, appointment]) => {
              console.log("Processing appointment:", title, appointment);
              try {
                // Parse the date string
                const [year, month, day] = appointment.date.split('-').map(Number);
                
                // Parse the time string
                let [hours, minutes] = appointment.time.slice(0, -3).split(':').map(Number);
                const isPM = appointment.time.toLowerCase().includes('pm');
                
                // Convert to 24-hour format if PM
                if (isPM && hours !== 12) {
                  hours += 12;
                }
                // Convert 12 AM to 00 hours
                if (!isPM && hours === 12) {
                  hours = 0;
                }
                
                // Create date object
                const appointmentDateTime = new Date(year, month - 1, day, hours, minutes);
                console.log("Parsed appointment datetime:", appointmentDateTime);
                
                const now = new Date();
                const isFuture = appointmentDateTime > now;
                console.log("Is future appointment:", isFuture);
                
                if (isFuture) {
                  appointmentsList.push({
                    id: title,
                    ...appointment
                  });
                }
              } catch (error) {
                console.error("Error processing appointment:", title, error);
              }
            });
            
            // Sort appointments by date and time
            appointmentsList.sort((a, b) => {
              const dateA = new Date(a.date);
              const dateB = new Date(b.date);
              return dateA - dateB;
            });
            
            console.log("Final processed appointments:", appointmentsList);
            setUpcomingAppointments(appointmentsList.slice(0, 3));
          } else {
            console.log("No appointments document found for user");
            setUpcomingAppointments([]);
          }
        },
        error => {
          console.error("Error fetching appointments:", error);
        }
      );

    return () => unsubscribe();
  }, [currentUser?.email]);

  const refreshData = () => {
    setRefreshing(true);
    const loadUserData = async () => {
      if (currentUser?.email) {
        try {
          const userData = await fetchUser(currentUser.email);
          if (userData) {
            setUser(userData);
          }
        } catch (error) {
          console.error("Error refreshing user data:", error);
        }
      }
    };
    
    loadUserData();
    setLastUpdated(new Date());
    setRefreshing(false);
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

  const AttendanceCard = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.cardTitle}>Today's Attendance</Text>
        {todayAttendance ? (
          <View>
            <View style={styles.statusContainer}>
              <Icon 
                name="check-circle" 
                size={24} 
                color="#4CAF50" 
                style={styles.statusIcon} 
              />
              <Text style={[styles.statusText, { color: '#4CAF50' }]}>
                Present
              </Text>
            </View>
            <Text style={styles.timeText}>
              Marked at: {new Date(todayAttendance.createdAt.toDate()).toLocaleTimeString()}
            </Text>
            <Text style={styles.confidenceText}>
              Verification Confidence: {todayAttendance.confidence.toFixed(1)}%
            </Text>
          </View>
        ) : (
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
        )}
      </Card.Content>
    </Card>
  );

  const StatsCard = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.cardTitle}>Monthly Statistics</Text>
        {attendanceStats && (
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{attendanceStats.totalDays}</Text>
              <Text style={styles.statLabel}>Total Days</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{attendanceStats.present}</Text>
              <Text style={styles.statLabel}>Present Days</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{attendanceStats.percentage.toFixed(1)}%</Text>
              <Text style={styles.statLabel}>Attendance</Text>
            </View>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  const renderAppointmentsSection = () => (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Appointments')}>
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>
      
      {upcomingAppointments.length > 0 ? (
        upcomingAppointments.map((appointment) => (
          <TouchableOpacity
            key={appointment.id}
            style={styles.appointmentCard}
            onPress={() => navigation.navigate('Appointments')}
          >
            <View style={styles.appointmentIcon}>
              <Icon name="calendar-check" size={20} color="#1D3557" />
            </View>
            <View style={styles.appointmentDetails}>
              <Text style={styles.appointmentTitle}>{appointment.title}</Text>
              <Text style={styles.appointmentInfo}>With: {appointment.with}</Text>
              <Text style={styles.appointmentInfo}>{appointment.date} • {appointment.time}</Text>
              <Text style={styles.appointmentInfo}>{appointment.place}</Text>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <TouchableOpacity
          style={styles.noAppointmentsCard}
          onPress={() => navigation.navigate('Appointments')}
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.greeting}>{user?.name || "User"}</Text>
          <Text style={styles.role}>
            {user?.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : "User"}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile", { 
            email: currentUser?.email,
            user: user,
            userId: currentUser?.uid
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

      {/* Main Content */}
      <ScrollView
        contentContainerStyle={styles.container}
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
        {/* Show attendance cards for staff only */}
        {user?.role === 'staff' || user?.role === 'admin' && (
          <>
            <AttendanceCard />
            <StatsCard />
          </>
        )}
        
        {/* Last updated time */}
        <Text style={styles.lastUpdatedText}>
          Last updated: {lastUpdated.toLocaleTimeString()}
        </Text>

        {/* Quick Actions Grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {(() => {
            let actions;
            const userAccessLevel = user?.accessLevel?.toLowerCase() || 'student';
            console.log("Current user access level for actions:", userAccessLevel); // Debug log
            
            switch (userAccessLevel) {
              case 'super admin':
              case 'department admin':
              case 'basic admin':
                console.log("Showing admin actions"); // Debug log
                actions = adminQuickActions;
                break;
              case 'staff':
                console.log("Showing staff actions"); // Debug log
                actions = staffQuickActions;
                break;
              case 'student':
                console.log("Showing student actions"); // Debug log
                actions = studentQuickActions;
                break;
              default:
                console.log("Showing default (student) actions"); // Debug log
                actions = studentQuickActions;
            }
            return actions.map((action) => (
              <TouchableOpacity
                key={action.id}
                style={[styles.actionCard, { backgroundColor: action.bgColor }]}
                onPress={() => {
                  if (action.route === 'UserAccessManagement') {
                    navigation.navigate(action.route, {
                      userAccess: user.accessLevel || 'Basic Admin'
                    });
                  } else if (action.route === 'MarkAttendance') {
                    navigation.navigate(action.route, {
                      userId: currentUser?.email?.toLowerCase(),
                      userName: user?.name,
                      email: currentUser?.email,
                      userData: user
                    });
                  } else {
                    navigation.navigate(action.route);
                  }
                }}
              >
                <Icon name={action.icon} size={24} color="#fff" />
                <Text style={styles.actionText}>{action.label}</Text>
              </TouchableOpacity>
            ));
          })()}
        </View>

       
         
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Tasks</Text>
              <Text style={styles.taskCountBadge}>{todayTasks.length} tasks</Text>
            </View>
            <View style={styles.tasksContainer}>
              {loading ? (
                <ActivityIndicator size="small" color="#1D3557" />
              ) : todayTasks.length > 0 ? (
                <FlatList
                  data={todayTasks}
                  scrollEnabled={false}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View style={[
                      styles.taskItem,
                      item.completed && styles.completedTaskItem
                    ]}>
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
                  )}
                />
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    textAlign: "right",
    marginBottom: 10,
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
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#2EC4B6',
  },
  appointmentIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E9ECEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 4,
  },
  appointmentInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
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
});

export default DashboardScreen;