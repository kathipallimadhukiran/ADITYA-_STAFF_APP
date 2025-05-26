import React, { useState, useEffect } from "react";
import {
    View,
    Text,
    StyleSheet,
    Image,
    TouchableOpacity,
    ScrollView,
    RefreshControl,
    FlatList,
    SafeAreaView
} from "react-native";
import Icon from "react-native-vector-icons/FontAwesome5";
import { firebase,auth } from '../../services/firebaseConfig';
import { useNavigation, useRoute } from "@react-navigation/native";
import { clearAuthState } from '../../services/authUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';

const StaffDashboard = () => {
    const navigation = useNavigation();
    const route = useRoute(); // Get route object from hook
const user = route.params?.user;

    const [refreshing, setRefreshing] = useState(false);
    const [todayTasks, setTodayTasks] = useState([]);

    // Staff-specific data
    const [announcements] = useState([
        { id: '1', title: "Staff meeting at 2 PM", time: "10 mins ago", department: "All" },
        { id: '2', title: "Deadline for reports submission", time: "1 hour ago", department: "Academic" },
        { id: '3', title: "System training session", time: "Yesterday", department: "IT" }
    ]);

    const [upcomingEvents] = useState([
        { id: '1', title: "Monthly review", date: "Tomorrow, 10:00 AM", location: "Conference Room A" },
        { id: '2', title: "Parent-Teacher meeting", date: "Friday, 2:00 PM", location: "Main Hall" }
    ]);

    const staffQuickActions =
[
  { id: '1', label: "Mark Attendance", icon: "clipboard-check", bgColor: "#FF9F1C", route: "MarkAttendance" },   // Bright Orange
  { id: '7', label: "My Tasks", icon: "tasks", bgColor: "#2EC4B6", route: "FacultyTasksScreen" },                          // Mint Green
  { id: '3', label: "Appointments", icon: "calendar-check", bgColor: "#F94144", route: "Appointments" },         // Soft Red
  { id: '2', label: "View Schedule", icon: "calendar-alt", bgColor: "#F3722C", route: "ViewSchedule" },          // Deep Orange
  { id: '6', label: "Messages", icon: "envelope", bgColor: "#90BE6D", route: "Messages" },                       // Olive Green
  { id: '5', label: "Track Location", icon: "map-marker-alt", bgColor: "#D00000", route: "TrackLocation" }       // Crimson Red
]





;

    useEffect(() => {
        // Fetch staff-specific data on component mount
        fetchTodayTasks();
    }, []);

    const fetchTodayTasks = () => {
        // Simulate API call
        setTimeout(() => {
            setTodayTasks([
                { id: '1', task: "Grade assignments", completed: false },
                { id: '2', task: "Prepare lesson plan", completed: true },
                { id: '3', task: "Meet with department head", completed: false }
            ]);
        }, 500);
    };


const handleLogout = async () => {
  try {
    await auth.signOut();
    await AsyncStorage.removeItem('@auth_user');
    console.log('User signed out!');
  } catch (error) {
    console.error('Logout Error:', error);
  }
};


    const refreshData = () => {
        setRefreshing(true);
        fetchTodayTasks();
        setTimeout(() => {
            setRefreshing(false);
        }, 1000);
    };

    const toggleTaskCompletion = (taskId) => {
        setTodayTasks(tasks =>
            tasks.map(task =>
                task.id === taskId ? { ...task, completed: !task.completed } : task
            )
        );
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            
            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.greeting}>Hello, {user?.name || 'Staff'}</Text>
                    <Text style={styles.role}>{user?.role || 'Staff Member'}</Text>
                </View>
                <TouchableOpacity
                    style={styles.profileButton}
                    onPress={() => navigation.navigate('StaffProfile')}
                >
                    <Icon name="user-circle" size={28} color="#fff" />
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
                    />
                }
            >
                {/* Quick Actions Grid */}
                <Text style={styles.sectionTitle}>Quick Actions</Text>
                <View style={styles.actionsGrid}>
                    {staffQuickActions.map((action) => (
                        <TouchableOpacity
                            key={action.id}
                            style={[styles.actionCard, { backgroundColor: action.bgColor }]}
                            onPress={() => navigation.navigate(action.route)}
                        >
                            <Icon name={action.icon} size={24} color="#fff" />
                            <Text style={styles.actionText}>{action.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Today's Tasks */}
                <Text style={styles.sectionTitle}>Today's Tasks</Text>
                <View style={styles.tasksContainer}>
                    {todayTasks.length > 0 ? (
                        <FlatList
                            data={todayTasks}

                            scrollEnabled={false}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <View style={styles.taskItem}>
                                    <TouchableOpacity onPress={() => toggleTaskCompletion(item.id)}>
                                        <Icon
                                            name={item.completed ? "check-circle" : "circle"}
                                            size={20}
                                            color={item.completed ? "#74C69D" : "#adb5bd"}
                                        />
                                    </TouchableOpacity>
                                    <Text
                                        style={[
                                            styles.taskText,
                                            item.completed && styles.completedTask
                                        ]}
                                    >
                                        {item.task}
                                    </Text>
                                </View>
                            )}
                        />
                    ) : (
                        <Text style={styles.noTasksText}>No tasks for today</Text>
                    )}
                </View>

                {/* Announcements */}
                <Text style={styles.sectionTitle}>Announcements</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {announcements.map((item) => (
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
                    {upcomingEvents.map((event) => (
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

                {/* Logout Button */}
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                    <Text style={styles.logoutButtonText}>Logout</Text>
                    <Icon name="sign-out-alt" size={16} color="#fff" />
                </TouchableOpacity>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#f8f9fa"
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        paddingTop: 40,
        height: 120,
        backgroundColor: "#1D3557",
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        elevation: 5
    },
    greeting: {
        fontSize: 22,
        fontWeight: "600",
        color: "#fff"
    },
    role: {
        fontSize: 16,
        color: "#E9ECEF",
        marginTop: 4
    },
    profileButton: {
        padding: 10
    },
    container: {
        padding: 20,
        paddingBottom: 40
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#1D3557",
        marginBottom: 15,
        marginTop: 10
    },
    actionsGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        justifyContent: "space-between",
        marginBottom: 20
    },
    actionCard: {
        width: "48%",
        height: 100,
        borderRadius: 12,
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 15,
        elevation: 3,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4
    },
    actionText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#fff",
        marginTop: 8,
        textAlign: "center"
    },
    tasksContainer: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 20,
        elevation: 2
    },
    taskItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: "#E9ECEF"
    },
    taskText: {
        fontSize: 16,
        marginLeft: 10,
        color: "#495057"
    },
    completedTask: {
        textDecorationLine: "line-through",
        color: "#adb5bd"
    },
    noTasksText: {
        fontSize: 16,
        color: "#6c757d",
        textAlign: "center",
        paddingVertical: 15
    },
    announcementCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        width: 280,
        marginRight: 15,
        elevation: 2
    },
    announcementTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#212529"
    },
    announcementMeta: {
        fontSize: 13,
        color: "#6c757d",
        marginTop: 5
    },
    eventsContainer: {
        marginBottom: 20
    },
    eventCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 15,
        marginBottom: 15,
        flexDirection: "row",
        elevation: 2
    },
    eventIcon: {
        marginRight: 15
    },
    eventDetails: {
        flex: 1
    },
    eventTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#212529",
        marginBottom: 5
    },
    eventInfo: {
        fontSize: 14,
        color: "#6c757d",
        marginBottom: 3
    },
    logoutButton: {
        backgroundColor: "#F94144",
        borderRadius: 8,
        padding: 15,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        marginTop: 20,
        elevation: 3
    },
    logoutButtonText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "600",
        marginRight: 10
    }
});

export default StaffDashboard;