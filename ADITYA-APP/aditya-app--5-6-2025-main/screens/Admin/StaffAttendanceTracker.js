import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { db } from '../../services/Firebase/firebaseConfig';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const StaffAttendanceTracker = () => {
  const [staffAttendance, setStaffAttendance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    fetchStaffAttendance();
  }, [selectedDate]);

  const fetchStaffAttendance = async () => {
    try {
      // Get the start and end of the selected date
      const startDate = new Date(selectedDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(selectedDate);
      endDate.setHours(23, 59, 59, 999);

      // Query attendance records for staff
      const attendanceQuery = query(
        collection(db, 'attendance'),
        where('date', '>=', startDate),
        where('date', '<=', endDate),
        where('userRole', '==', 'staff'),
        orderBy('date', 'desc')
      );

      const attendanceSnapshot = await getDocs(attendanceQuery);
      const attendanceData = [];

      // Get all staff members
      const staffQuery = query(
        collection(db, 'users'),
        where('role', '==', 'staff')
      );
      const staffSnapshot = await getDocs(staffQuery);
      const staffMembers = {};
      
      staffSnapshot.forEach(doc => {
        staffMembers[doc.id] = doc.data();
      });

      // Process attendance data
      attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        const staffMember = staffMembers[data.userId];
        if (staffMember) {
          attendanceData.push({
            id: doc.id,
            ...data,
            name: staffMember.name,
            department: staffMember.department,
          });
        }
      });

      // Add staff members with no attendance record as absent
      staffSnapshot.forEach(doc => {
        const staffMember = doc.data();
        const hasAttendance = attendanceData.some(
          record => record.userId === doc.id
        );
        if (!hasAttendance) {
          attendanceData.push({
            id: doc.id,
            userId: doc.id,
            name: staffMember.name,
            department: staffMember.department,
            status: 'Absent',
            date: selectedDate,
          });
        }
      });

      setStaffAttendance(attendanceData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching staff attendance:', error);
      Alert.alert('Error', 'Failed to load staff attendance');
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'present':
        return '#2EC4B6';
      case 'absent':
        return '#FF9F1C';
      case 'late':
        return '#F94144';
      default:
        return '#6C757D';
    }
  };

  const StaffCard = ({ staff }) => (
    <Card style={styles.staffCard}>
      <Card.Content>
        <View style={styles.staffHeader}>
          <View>
            <Text style={styles.staffName}>{staff.name}</Text>
            <Text style={styles.staffDepartment}>{staff.department}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(staff.status) }]}>
            <Text style={styles.statusText}>{staff.status || 'Not Marked'}</Text>
          </View>
        </View>
        {staff.checkInTime && (
          <View style={styles.timeInfo}>
            <Icon name="clock" size={14} color="#666" />
            <Text style={styles.timeText}>
              Check-in: {new Date(staff.checkInTime).toLocaleTimeString()}
            </Text>
          </View>
        )}
      </Card.Content>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Staff Attendance Tracker</Text>
      <View style={styles.dateContainer}>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => {
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() - 1);
            setSelectedDate(newDate);
          }}
        >
          <Icon name="chevron-left" size={20} color="#1D3557" />
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => {
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() + 1);
            setSelectedDate(newDate);
          }}
        >
          <Icon name="chevron-right" size={20} color="#1D3557" />
        </TouchableOpacity>
      </View>
      <FlatList
        data={staffAttendance}
        renderItem={({ item }) => <StaffCard staff={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  dateContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    elevation: 2,
  },
  dateButton: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  staffCard: {
    marginBottom: 12,
    elevation: 2,
    borderRadius: 8,
  },
  staffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staffName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  staffDepartment: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  timeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  timeText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
});

export default StaffAttendanceTracker; 