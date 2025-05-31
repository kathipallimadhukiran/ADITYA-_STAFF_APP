import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import {
  Text,
  Card,
  Title,
  Paragraph,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AttendanceSettings = () => {
  const navigation = useNavigation();

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Attendance Information</Title>
          <Paragraph style={styles.description}>
            Students and staff can mark their attendance at any time during the day.
          </Paragraph>

          <View style={styles.infoContainer}>
            <Icon name="information" size={20} color="#1976D2" />
            <Text style={styles.infoText}>
              Attendance can be marked 24/7 with proper authentication.
            </Text>
          </View>
        </Card.Content>
      </Card>

      <Card style={[styles.card, styles.previewCard]}>
        <Card.Content>
          <Title>Attendance Guidelines</Title>
          <View style={styles.scheduleItem}>
            <Icon name="check-circle" size={20} color="#4CAF50" />
            <Text style={styles.scheduleText}>
              Face verification required for attendance
            </Text>
          </View>
          <View style={styles.scheduleItem}>
            <Icon name="account-check" size={20} color="#4CAF50" />
            <Text style={styles.scheduleText}>
              Available for both students and staff
            </Text>
          </View>
          <View style={styles.scheduleItem}>
            <Icon name="clock-outline" size={20} color="#4CAF50" />
            <Text style={styles.scheduleText}>
              Flexible timing - mark attendance anytime
            </Text>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  card: {
    marginBottom: 16,
    elevation: 4,
  },
  description: {
    marginBottom: 20,
    color: '#666',
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  infoText: {
    marginLeft: 8,
    color: '#1976D2',
    flex: 1,
  },
  previewCard: {
    backgroundColor: '#FAFAFA',
  },
  scheduleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  scheduleText: {
    marginLeft: 12,
    fontSize: 14,
    color: '#333',
  },
});

export default AttendanceSettings; 