import React, { useState } from "react";
import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Button, Text, Card, Divider } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";

const ViewSchedulePage = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState("today"); // 'today' or 'week'

  // Sample timetable data
  const todayTimetable = [
    { time: "09:00 - 10:00", subject: "Mathematics", room: "Room 101" },
    { time: "10:15 - 11:15", subject: "Physics", room: "Lab 2" },
    { time: "11:30 - 12:30", subject: "Chemistry", room: "Lab 1" },
    { time: "01:30 - 02:30", subject: "Biology", room: "Room 105" },
  ];

  const weeklySchedule = [
    { 
      day: "Monday",
      classes: [
        { time: "09:00 - 10:00", subject: "Math", room: "101" },
        { time: "10:15 - 11:15", subject: "Physics", room: "Lab 2" }
      ]
    },
    { 
      day: "Tuesday",
      classes: [
        { time: "09:00 - 10:00", subject: "Chemistry", room: "Lab 1" },
        { time: "10:15 - 11:15", subject: "Biology", room: "105" }
      ]
    },
    // Add more days as needed
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome, Staff Member 👋</Text>
      
      {/* Quick Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => navigation.navigate("MarkAttendancePage")}
        >
          <MaterialIcons name="assignment" size={24} color="#fff" />
          <Text style={styles.actionText}>Attendance</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => navigation.navigate("ViewSchedulePage")}
        >
          <MaterialIcons name="schedule" size={24} color="#fff" />
          <Text style={styles.actionText}>Schedule</Text>
        </TouchableOpacity>
      </View>

      {/* Schedule View Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "today" && styles.activeTab]}
          onPress={() => setActiveTab("today")}
        >
          <Text style={styles.tabText}>Today's Schedule</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === "week" && styles.activeTab]}
          onPress={() => setActiveTab("week")}
        >
          <Text style={styles.tabText}>Weekly View</Text>
        </TouchableOpacity>
      </View>

      {/* Schedule Content */}
      <Card style={styles.scheduleCard}>
        <Card.Content>
          {activeTab === "today" ? (
            <>
              <Text style={styles.scheduleTitle}>Today's Classes</Text>
              {todayTimetable.map((item, index) => (
                <View key={index}>
                  <View style={styles.classItem}>
                    <Text style={styles.classTime}>{item.time}</Text>
                    <View style={styles.classDetails}>
                      <Text style={styles.classSubject}>{item.subject}</Text>
                      <Text style={styles.classRoom}>{item.room}</Text>
                    </View>
                  </View>
                  {index < todayTimetable.length - 1 && <Divider />}
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.scheduleTitle}>Weekly Schedule</Text>
              {weeklySchedule.map((day, index) => (
                <View key={index}>
                  <Text style={styles.dayTitle}>{day.day}</Text>
                  {day.classes.map((cls, clsIndex) => (
                    <View key={clsIndex} style={styles.classItem}>
                      <Text style={styles.classTime}>{cls.time}</Text>
                      <View style={styles.classDetails}>
                        <Text style={styles.classSubject}>{cls.subject}</Text>
                        <Text style={styles.classRoom}>{cls.room}</Text>
                      </View>
                    </View>
                  ))}
                  {index < weeklySchedule.length - 1 && <Divider style={styles.dayDivider} />}
                </View>
              ))}
            </>
          )}
        </Card.Content>
      </Card>

      {/* Upcoming Events */}
      <Text style={styles.sectionTitle}>Upcoming Events</Text>
      <Card style={styles.eventCard}>
        <Card.Content>
          <View style={styles.eventItem}>
            <MaterialIcons name="event" size={20} color="#6200ee" />
            <Text style={styles.eventText}>Staff Meeting - Tomorrow 2:00 PM</Text>
          </View>
          <Divider />
          <View style={styles.eventItem}>
            <MaterialIcons name="event" size={20} color="#6200ee" />
            <Text style={styles.eventText}>Parent-Teacher Meeting - Friday</Text>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: "#f5f5f5",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  actionButton: {
    backgroundColor: "#6200ee",
    padding: 15,
    borderRadius: 10,
    width: "48%",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    elevation: 3,
  },
  actionText: {
    color: "#fff",
    marginLeft: 10,
    fontWeight: "bold",
  },
  tabContainer: {
    flexDirection: "row",
    marginBottom: 15,
    backgroundColor: "#e0e0e0",
    borderRadius: 10,
    overflow: "hidden",
  },
  tabButton: {
    flex: 1,
    padding: 12,
    alignItems: "center",
  },
  activeTab: {
    backgroundColor: "#6200ee",
  },
  tabText: {
    fontWeight: "bold",
    color: "#333",
  },
  activeTabText: {
    color: "#fff",
  },
  scheduleCard: {
    marginBottom: 20,
    borderRadius: 10,
    elevation: 2,
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 15,
    color: "#6200ee",
  },
  classItem: {
    flexDirection: "row",
    paddingVertical: 12,
  },
  classTime: {
    width: 80,
    fontWeight: "bold",
    color: "#555",
  },
  classDetails: {
    flex: 1,
  },
  classSubject: {
    fontWeight: "bold",
    fontSize: 16,
  },
  classRoom: {
    color: "#666",
    fontSize: 14,
  },
  dayTitle: {
    fontWeight: "bold",
    fontSize: 16,
    marginTop: 10,
    marginBottom: 5,
    color: "#333",
  },
  dayDivider: {
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#333",
  },
  eventCard: {
    borderRadius: 10,
    elevation: 2,
  },
  eventItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  eventText: {
    marginLeft: 10,
    fontSize: 15,
  },
});

export default ViewSchedulePage;