import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import {
  Text,
  Card,
  TextInput,
  Button,
  Portal,
  Modal,
  List,
  Switch,
  Divider,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { db } from '../../services/Firebase/firebaseConfig';
import DateTimePicker from '@react-native-community/datetimepicker';

const defaultDayTiming = {
  startTime: '09:00',
  endTime: '17:00',
  lateMarkingTime: '09:30',
  autoAbsentTime: '23:15',
  relaxationTime: '15',
};

const defaultSettings = {
  workingDays: {
    Sunday: { isWorking: false, ...defaultDayTiming },
    Monday: { isWorking: true, ...defaultDayTiming },
    Tuesday: { isWorking: true, ...defaultDayTiming },
    Wednesday: { isWorking: true, ...defaultDayTiming },
    Thursday: { isWorking: true, ...defaultDayTiming },
    Friday: { isWorking: true, ...defaultDayTiming },
    Saturday: { isWorking: false, ...defaultDayTiming },
  },
  holidays: [],
};

const AttendanceSettings = ({ navigation }) => {
  const [settings, setSettings] = useState(defaultSettings);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [currentTimeField, setCurrentTimeField] = useState(null);
  const [currentDay, setCurrentDay] = useState(null);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [newHoliday, setNewHoliday] = useState({
    date: new Date(),
    description: '',
  });
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [expandedDay, setExpandedDay] = useState(null);
  const [showHolidayDatePicker, setShowHolidayDatePicker] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setInitialLoading(true);
      const doc = await db.collection('settings').doc('attendance').get();
      
      if (doc.exists) {
        const data = doc.data();
        // Ensure all required fields exist
        const workingDays = data.workingDays || defaultSettings.workingDays;
        const holidays = Array.isArray(data.holidays) ? data.holidays : [];

        // Convert old format to new format if necessary
        const convertedData = {
          workingDays: Object.keys(workingDays).reduce((acc, day) => ({
            ...acc,
            [day]: {
              isWorking: typeof workingDays[day] === 'boolean' ? workingDays[day] : workingDays[day]?.isWorking ?? defaultSettings.workingDays[day].isWorking,
              ...defaultDayTiming,
              ...(typeof workingDays[day] === 'object' ? workingDays[day] : {})
            }
          }), {}),
          holidays
        };

        setSettings(convertedData);
      } else {
        // If no settings exist, create with defaults
        await db.collection('settings').doc('attendance').set(defaultSettings);
        setSettings(defaultSettings);
      }
    } catch (error) {
      console.error('[DEBUG] Error loading settings:', error);
      Alert.alert('Error', 'Failed to load attendance settings. Using default settings.');
      setSettings(defaultSettings);
    } finally {
      setInitialLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setLoading(true);
      await db.collection('settings').doc('attendance').set(settings);
      Alert.alert('Success', 'Attendance settings updated successfully');
    } catch (error) {
      console.error('[DEBUG] Error saving settings:', error);
      Alert.alert('Error', 'Failed to save attendance settings');
    } finally {
      setLoading(false);
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime && currentTimeField && currentDay) {
      // Format time in 24-hour format
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      const timeString = `${hours}:${minutes}`;
      
      setSettings(prev => ({
        ...prev,
        workingDays: {
          ...prev.workingDays,
          [currentDay]: {
            ...prev.workingDays[currentDay],
            [currentTimeField]: timeString
          }
        }
      }));
    }
  };

  const formatTimeDisplay = (timeString) => {
    // Convert time string to 24-hour format display
    const [hours, minutes] = timeString.split(':');
    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
  };

  const showTimePickerFor = (day, field) => {
    setCurrentDay(day);
    setCurrentTimeField(field);
    setShowTimePicker(true);
  };

  const toggleWorkingDay = (day) => {
    setSettings(prev => ({
      ...prev,
      workingDays: {
        ...prev.workingDays,
        [day]: {
          ...prev.workingDays[day],
          isWorking: !prev.workingDays[day].isWorking
        }
      }
    }));
  };

  const addHoliday = () => {
    if (!newHoliday.description) {
      Alert.alert('Error', 'Please enter a holiday description');
      return;
    }

    setSettings(prev => ({
      ...prev,
      holidays: [
        ...prev.holidays,
        {
          date: newHoliday.date.toISOString().split('T')[0],
          description: newHoliday.description
        }
      ]
    }));
    setShowHolidayModal(false);
    setNewHoliday({ date: new Date(), description: '' });
  };

  const removeHoliday = (index) => {
    setSettings(prev => ({
      ...prev,
      holidays: prev.holidays.filter((_, i) => i !== index)
    }));
  };

  const handleHolidayDateChange = (event, selectedDate) => {
    setShowHolidayDatePicker(false);
    if (selectedDate) {
      setNewHoliday(prev => ({
        ...prev,
        date: selectedDate
      }));
    }
  };

  const renderDayTimings = (day) => {
    const daySettings = settings.workingDays[day];
    const isExpanded = expandedDay === day;

    return (
      <Card style={styles.dayCard} key={day}>
        <Card.Title
          title={day}
          right={() => (
            <View style={styles.dayHeaderRight}>
              <Switch
                value={daySettings.isWorking}
                onValueChange={() => toggleWorkingDay(day)}
              />
              <IconButton
                icon={isExpanded ? "chevron-up" : "chevron-down"}
                onPress={() => setExpandedDay(isExpanded ? null : day)}
              />
            </View>
          )}
        />
        {isExpanded && daySettings.isWorking && (
          <Card.Content>
            <TouchableOpacity 
              style={styles.timeInput}
              onPress={() => showTimePickerFor(day, 'startTime')}
            >
              <Text style={styles.label}>Start Time (24h)</Text>
              <Text style={styles.timeText}>{formatTimeDisplay(daySettings.startTime)}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.timeInput}
              onPress={() => showTimePickerFor(day, 'endTime')}
            >
              <Text style={styles.label}>End Time (24h)</Text>
              <Text style={styles.timeText}>{formatTimeDisplay(daySettings.endTime)}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.timeInput}
              onPress={() => showTimePickerFor(day, 'lateMarkingTime')}
            >
              <Text style={styles.label}>Late Marking Time (24h)</Text>
              <Text style={styles.timeText}>{formatTimeDisplay(daySettings.lateMarkingTime)}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.timeInput}
              onPress={() => showTimePickerFor(day, 'autoAbsentTime')}
            >
              <Text style={styles.label}>Auto Absent Time (24h)</Text>
              <Text style={styles.timeText}>{formatTimeDisplay(daySettings.autoAbsentTime)}</Text>
            </TouchableOpacity>

            <TextInput
              label="Relaxation Time (minutes)"
              value={daySettings.relaxationTime}
              onChangeText={(text) => setSettings(prev => ({
                ...prev,
                workingDays: {
                  ...prev.workingDays,
                  [day]: {
                    ...prev.workingDays[day],
                    relaxationTime: text
                  }
                }
              }))}
              keyboardType="numeric"
              style={styles.input}
            />
          </Card.Content>
        )}
      </Card>
    );
  };

  if (initialLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <Card style={styles.card}>
          <Card.Title title="Working Days & Timings" />
          <Card.Content>
            {Object.keys(settings.workingDays || {}).map(day => renderDayTimings(day))}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Title 
            title="Holidays"
            right={() => (
              <Button 
                onPress={() => {
                  setNewHoliday({ date: new Date(), description: '' });
                  setShowHolidayModal(true);
                }}
                mode="contained"
                style={styles.addButton}
              >
                Add Holiday
              </Button>
            )}
          />
          <Card.Content>
            {(settings.holidays || []).length > 0 ? (
              (settings.holidays || [])
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((holiday, index) => (
                  <List.Item
                    key={index}
                    title={holiday.description}
                    description={new Date(holiday.date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                    right={() => (
                      <TouchableOpacity 
                        onPress={() => removeHoliday(index)}
                        style={styles.deleteButton}
                      >
                        <Icon name="trash" size={20} color="#FF5722" />
                      </TouchableOpacity>
                    )}
                    style={styles.holidayItem}
                  />
                ))
            ) : (
              <Text style={styles.noHolidaysText}>No holidays added yet</Text>
            )}
          </Card.Content>
        </Card>

        <Button
          mode="contained"
          onPress={saveSettings}
          loading={loading}
          style={styles.saveButton}
        >
          Save Settings
        </Button>
      </ScrollView>

      {showTimePicker && (
        <DateTimePicker
          value={new Date(`2000-01-01T${settings.workingDays[currentDay][currentTimeField]}:00`)}
          mode="time"
          is24Hour={true}
          display="spinner"
          onChange={handleTimeChange}
          style={{ backgroundColor: 'white' }}
        />
      )}

      <Portal>
        <Modal
          visible={showHolidayModal}
          onDismiss={() => setShowHolidayModal(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Add Holiday</Text>
          
          <TouchableOpacity 
            style={styles.dateInput}
            onPress={() => setShowHolidayDatePicker(true)}
          >
            <Text style={styles.label}>Date</Text>
            <Text style={styles.dateText}>
              {newHoliday.date.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </Text>
          </TouchableOpacity>

          <TextInput
            label="Holiday Description"
            value={newHoliday.description}
            onChangeText={(text) => setNewHoliday(prev => ({ ...prev, description: text }))}
            style={styles.input}
          />

          <View style={styles.modalButtons}>
            <Button 
              mode="outlined" 
              onPress={() => setShowHolidayModal(false)}
              style={[styles.modalButton, styles.cancelButton]}
            >
              Cancel
            </Button>
            <Button 
              mode="contained" 
              onPress={addHoliday}
              style={[styles.modalButton, styles.addButton]}
            >
              Add Holiday
            </Button>
          </View>

          {showHolidayDatePicker && (
            <DateTimePicker
              value={newHoliday.date}
              mode="date"
              display="default"
              onChange={handleHolidayDateChange}
            />
          )}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    margin: 10,
    elevation: 4,
  },
  dayCard: {
    marginVertical: 5,
    elevation: 2,
  },
  dayHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  timeInput: {
    marginVertical: 10,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  timeText: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  input: {
    marginVertical: 10,
    backgroundColor: '#fff',
  },
  saveButton: {
    margin: 20,
    paddingVertical: 8,
    backgroundColor: '#1D3557',
  },
  addButton: {
    marginRight: 10,
  },
  modal: {
    backgroundColor: 'white',
    padding: 20,
    margin: 20,
    borderRadius: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  dateInput: {
    marginVertical: 10,
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  dateText: {
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 20,
  },
  modalButton: {
    marginLeft: 10,
    minWidth: 100,
  },
  cancelButton: {
    borderColor: '#6c757d',
  },
  deleteButton: {
    padding: 8,
  },
  holidayItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  noHolidaysText: {
    textAlign: 'center',
    color: '#6c757d',
    fontStyle: 'italic',
    marginVertical: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    color: '#1D3557',
    fontSize: 16,
  }
});

export default AttendanceSettings; 