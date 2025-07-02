import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, Card, TextInput, Button, SegmentedButtons, useTheme, IconButton } from 'react-native-paper';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatTime = (date) => {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

const EditSchedulePage = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const theme = useTheme();
  
  const initialDay = route.params?.selectedDay || 'Monday';
  const sessionIndex = route.params?.sessionIndex;
  const sessionData = route.params?.sessionData;

  const [selectedDay, setSelectedDay] = useState(initialDay);
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date(new Date().setHours(startTime.getHours() + 1)));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [subject, setSubject] = useState(sessionData?.subject || '');
  const [section, setSection] = useState(sessionData?.section || '');
  const [roomNo, setRoomNo] = useState(sessionData?.roomNo || '');
  const [loading, setLoading] = useState(false);

  const onStartTimeChange = (event, selectedDate) => {
    setShowStartPicker(false);
    if (selectedDate) {
      setStartTime(selectedDate);
      // Automatically set end time to 1 hour after start time
      const newEndTime = new Date(selectedDate);
      newEndTime.setHours(selectedDate.getHours() + 1);
      setEndTime(newEndTime);
    }
  };

  const onEndTimeChange = (event, selectedDate) => {
    setShowEndPicker(false);
    if (selectedDate) {
      setEndTime(selectedDate);
    }
  };

  const validateForm = () => {
    if (!subject.trim()) {
      Alert.alert('Error', 'Please enter a subject name');
      return false;
    }
    if (!section.trim()) {
      Alert.alert('Error', 'Please enter a section');
      return false;
    }
    if (!roomNo.trim()) {
      Alert.alert('Error', 'Please enter a room number');
      return false;
    }
    if (endTime <= startTime) {
      Alert.alert('Error', 'End time must be after start time');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    try {
      setLoading(true);
      const scheduleData = {
        startTime: formatTime(startTime),
        endTime: formatTime(endTime),
        time: `${formatTime(startTime)} - ${formatTime(endTime)}`,
        subject: subject.trim(),
        section: section.trim(),
        roomNo: roomNo.trim()
      };

      // Load existing schedule
      const savedScheduleStr = await AsyncStorage.getItem('schedule');
      let savedSchedule = savedScheduleStr ? JSON.parse(savedScheduleStr) : {};

      // Initialize day array if it doesn't exist
      if (!savedSchedule[selectedDay]) {
        savedSchedule[selectedDay] = [];
      }

      if (sessionIndex !== undefined) {
        // Update existing session
        savedSchedule[selectedDay][sessionIndex] = scheduleData;
      } else {
        // Add new session
        savedSchedule[selectedDay].push(scheduleData);
      }

      // Sort sessions by start time
      savedSchedule[selectedDay].sort((a, b) => {
        return new Date('1970/01/01 ' + a.startTime) - new Date('1970/01/01 ' + b.startTime);
      });

      await AsyncStorage.setItem('schedule', JSON.stringify(savedSchedule));
      navigation.goBack();
    } catch (error) {
      console.error('Error saving schedule:', error);
      Alert.alert('Error', 'Failed to save schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (sessionIndex === undefined) return;

    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const savedScheduleStr = await AsyncStorage.getItem('schedule');
              let savedSchedule = JSON.parse(savedScheduleStr);
              
              savedSchedule[selectedDay].splice(sessionIndex, 1);
              await AsyncStorage.setItem('schedule', JSON.stringify(savedSchedule));
              navigation.goBack();
            } catch (error) {
              console.error('Error deleting class:', error);
              Alert.alert('Error', 'Failed to delete class');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.titleContainer}>
        <Text style={styles.pageTitle}>{sessionIndex !== undefined ? 'Edit Class' : 'Add New Class'}</Text>
        {sessionIndex !== undefined && (
          <IconButton
            icon="trash-can"
            size={24}
            onPress={handleDelete}
            iconColor="#6c757d"
          />
        )}
      </View>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Day</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.segmentedButtonsContainer}
          >
            <SegmentedButtons
              value={selectedDay}
              onValueChange={setSelectedDay}
              buttons={daysOfWeek.map(day => ({
                value: day,
                label: day.substring(0, 3),
                style: styles.segmentButton,
                labelStyle: styles.segmentButtonLabel
              }))}
              style={styles.segmentedButtons}
            />
          </ScrollView>

          <Text style={styles.sectionTitle}>Time</Text>
          <View style={styles.timeInputContainer}>
            <TouchableOpacity 
              style={styles.timePickerButton}
              onPress={() => setShowStartPicker(true)}
            >
              <Text style={styles.timePickerButtonText}>Start Time</Text>
              <Text style={styles.timeText}>{formatTime(startTime)}</Text>
              <IconButton icon="clock-outline" size={20} />
            </TouchableOpacity>

            <Text style={styles.timeInputSeparator}>to</Text>

            <TouchableOpacity 
              style={styles.timePickerButton}
              onPress={() => setShowEndPicker(true)}
            >
              <Text style={styles.timePickerButtonText}>End Time</Text>
              <Text style={styles.timeText}>{formatTime(endTime)}</Text>
              <IconButton icon="clock-outline" size={20} />
            </TouchableOpacity>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startTime}
              mode="time"
              is24Hour={false}
              onChange={onStartTimeChange}
            />
          )}

          {showEndPicker && (
            <DateTimePicker
              value={endTime}
              mode="time"
              is24Hour={false}
              onChange={onEndTimeChange}
            />
          )}

          <TextInput
            label="Subject"
            value={subject}
            onChangeText={setSubject}
            style={styles.input}
            mode="outlined"
            right={<TextInput.Icon icon="book" />}
          />

          <TextInput
            label="Section"
            value={section}
            onChangeText={setSection}
            style={styles.input}
            mode="outlined"
            right={<TextInput.Icon icon="account-group" />}
          />

          <TextInput
            label="Room Number"
            value={roomNo}
            onChangeText={setRoomNo}
            style={styles.input}
            mode="outlined"
            keyboardType="numeric"
            right={<TextInput.Icon icon="door" />}
          />

          <Button
            mode="contained"
            onPress={handleSave}
            style={styles.saveButton}
            loading={loading}
            disabled={loading}
          >
            {sessionIndex !== undefined ? 'Update Class' : 'Add Class'}
          </Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  card: {
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
    elevation: 3,
    backgroundColor: 'white',
    borderLeftWidth: 4,
    borderLeftColor: '#457B9D',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#1D3557',
  },
  segmentedButtonsContainer: {
    paddingBottom: 8,
  },
  segmentedButtons: {
    marginBottom: 16,
    flexDirection: 'row',
  },
  segmentButton: {
    flex: 0,
    minWidth: 80,
    marginHorizontal: 2,
    borderColor: '#457B9D',
  },
  segmentButtonLabel: {
    fontSize: 13,
    color: '#1D3557',
  },
  timeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    justifyContent: 'space-between',
  },
  timePickerButton: {
    flex: 1,
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timePickerButtonText: {
    fontSize: 12,
    color: '#1D3557',
  },
  timeText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1D3557',
  },
  timeInputSeparator: {
    marginHorizontal: 12,
    color: '#6c757d',
  },
  input: {
    marginBottom: 16,
    backgroundColor: 'white',
    borderColor: '#E9ECEF',
  },
  saveButton: {
    marginTop: 24,
    paddingVertical: 8,
    backgroundColor: '#457B9D',
  },
  deleteButton: {
    marginRight: 8,
    color: '#6c757d',
  },
});

export default EditSchedulePage; 