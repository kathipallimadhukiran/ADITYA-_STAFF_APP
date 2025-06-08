import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { Card } from 'react-native-paper';
import { getAuth } from '../../services/Firebase/firebaseConfig';
import { fetchTodayAttendance, fetchMonthlyAttendance, fetchAttendanceStats } from '../../services/Firebase/firestoreService';

export default function ViewAttendanceScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [monthlyAttendance, setMonthlyAttendance] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const loadData = async () => {
    try {
      const auth = getAuth();
      const email = auth.currentUser?.email;

      if (!email) {
        setError('Please log in to view attendance');
        setLoading(false);
        return;
      }

      // Get today's attendance
      const today = await fetchTodayAttendance(email);
      setTodayAttendance(today);

      // Get current month's attendance
      const now = new Date();
      const monthlyData = await fetchMonthlyAttendance(email, now.getFullYear(), now.getMonth() + 1);
      setMonthlyAttendance(monthlyData);

      // Get attendance statistics
      const statistics = await fetchAttendanceStats(email);
      setStats(statistics);

      setError(null);
    } catch (err) {
      console.error('Error loading attendance:', err);
      setError('Failed to load attendance data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadData();
  }, []);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
        <Text style={styles.loadingText}>Loading attendance records...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Today's Attendance */}
      <Card style={styles.card}>
        <Card.Title title="Today's Attendance" />
        <Card.Content>
          {todayAttendance ? (
            <View>
              <Text style={styles.statusText}>
                Status: <Text style={styles.highlight}>{todayAttendance.status}</Text>
              </Text>
              <Text style={styles.timeText}>
                Time: {todayAttendance.timeStr}
              </Text>
              {todayAttendance.isLate && (
                <Text style={styles.lateText}>Late Arrival</Text>
              )}
              <Text style={styles.verificationText}>
                Verification: {todayAttendance.verificationStatus}
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>No attendance marked for today</Text>
          )}
        </Card.Content>
      </Card>

      {/* Monthly Statistics */}
      <Card style={styles.card}>
        <Card.Title title="Monthly Statistics" />
        <Card.Content>
          {monthlyAttendance ? (
            <View>
              <Text style={styles.statText}>
                Present: <Text style={styles.highlight}>{monthlyAttendance.summary.present}</Text> days
              </Text>
              <Text style={styles.statText}>
                Absent: <Text style={styles.highlight}>{monthlyAttendance.summary.absent}</Text> days
              </Text>
              <Text style={styles.statText}>
                Late: <Text style={styles.highlight}>{monthlyAttendance.summary.late}</Text> days
              </Text>
              <Text style={styles.percentageText}>
                Attendance: {monthlyAttendance.summary.percentage}%
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>No records for this month</Text>
          )}
        </Card.Content>
      </Card>

      {/* Overall Statistics */}
      <Card style={styles.card}>
        <Card.Title title="Overall Statistics" />
        <Card.Content>
          {stats ? (
            <View>
              <Text style={styles.statText}>
                Total Working Days: <Text style={styles.highlight}>{stats.totalDays}</Text>
              </Text>
              <Text style={styles.statText}>
                Present Days: <Text style={styles.highlight}>{stats.presentDays}</Text>
              </Text>
              <Text style={styles.statText}>
                Absent Days: <Text style={styles.highlight}>{stats.absentDays}</Text>
              </Text>
              <Text style={styles.percentageText}>
                Overall Attendance: {stats.percentage}%
              </Text>
              <Text style={styles.streakText}>
                Current Streak: {stats.streak} days
              </Text>
            </View>
          ) : (
            <Text style={styles.noDataText}>No statistics available</Text>
          )}
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  card: {
    marginBottom: 16,
    elevation: 4,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 18,
    marginBottom: 8,
  },
  timeText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  lateText: {
    color: '#E63946',
    fontSize: 16,
    marginBottom: 4,
  },
  verificationText: {
    fontSize: 16,
    color: '#457B9D',
  },
  statText: {
    fontSize: 16,
    marginBottom: 4,
  },
  percentageText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginTop: 8,
  },
  streakText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2A9D8F',
    marginTop: 8,
  },
  highlight: {
    color: '#1D3557',
    fontWeight: 'bold',
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
    fontStyle: 'italic',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#E63946',
    textAlign: 'center',
  },
}); 