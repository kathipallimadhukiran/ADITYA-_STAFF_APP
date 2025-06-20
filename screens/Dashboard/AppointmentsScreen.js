import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { Card, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import DateTimePicker from '@react-native-community/datetimepicker';
import { firebase, getAuth, db } from '../../services/Firebase/firebaseConfig';

const AppointmentsScreen = () => {
  const [appointments, setAppointments] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [confirmationPopupVisible, setConfirmationPopupVisible] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    title: '',
    with: '',
    date: new Date(),
    time: new Date(),
    place: '',
    description: '',
    department: '',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [newlyCreatedAppointment, setNewlyCreatedAppointment] = useState(null);
  const userEmail = getAuth().currentUser?.email;

  useEffect(() => {
    if (!userEmail) return;

    // Subscribe to appointments document
    const unsubscribe = db.collection('appointments')
      .doc(userEmail)
      .onSnapshot(doc => {
        if (doc.exists) {
          const data = doc.data() || {};
          const appointmentsList = [];
          
          // Ensure data is an object before using Object.entries
          if (typeof data === 'object' && data !== null) {
            Object.entries(data).forEach(([title, appointment]) => {
              if (appointment && appointment.date && appointment.time) {
                const appointmentDateTime = new Date(appointment.date + ' ' + appointment.time);
                if (appointmentDateTime < new Date()) {
                  // Delete completed appointment
                  deleteAppointment(title);
                } else {
                  appointmentsList.push({
                    id: title,
                    ...appointment
                  });
                }
              }
            });
          }
          
          // Sort appointments by date and time
          appointmentsList.sort((a, b) => {
            const dateA = new Date(a.date + ' ' + a.time);
            const dateB = new Date(b.date + ' ' + b.time);
            return dateA - dateB;
          });
          
          console.log('[DEBUG] Setting appointments:', appointmentsList.length);
          setAppointments(appointmentsList);
        } else {
          console.log('[DEBUG] No appointments document exists');
          setAppointments([]);
        }
      }, error => {
        console.error("Error fetching appointments:", error);
        Alert.alert("Error", "Failed to load appointments");
      });
    return () => unsubscribe();
  }, [userEmail]);

  const generateUniqueTitle = async (baseTitle) => {
    try {
      const docRef = await db.collection('appointments')
        .doc(userEmail)
        .get();

      if (!docRef.exists) return baseTitle;

      const data = docRef.data() || {};
      let counter = 1;
      let newTitle = baseTitle;

      while (data[newTitle]) {
        newTitle = `${baseTitle}(${counter})`;
        counter++;
      }

      return newTitle;
    } catch (error) {
      console.error('Error generating unique title:', error);
      return baseTitle;
    }
  };

  const handleAddAppointment = async () => {
    if (!userEmail) {
      Alert.alert('Error', 'You must be logged in to create appointments');
      return;
    }

    // Validate all required fields
    if (!newAppointment.title.trim()) {
      Alert.alert('Error', 'Please enter an appointment title');
      return;
    }
    if (!newAppointment.with.trim()) {
      Alert.alert('Error', 'Please enter who the appointment is with');
      return;
    }
    if (!newAppointment.place.trim()) {
      Alert.alert('Error', 'Please enter the appointment location');
      return;
    }
    if (!newAppointment.department.trim()) {
      Alert.alert('Error', 'Please enter the department');
      return;
    }

    // Show confirmation popup
    setConfirmationPopupVisible(true);
  };

  const proceedWithAppointment = async () => {
    setIsLoading(true);
    try {
      // Get the selected date components
      const selectedDate = newAppointment.date;
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      
      // Format date as YYYY-MM-DD without timezone conversion
      const formattedDate = `${year}-${month}-${day}`;
      
      // Format time to 12-hour format (hh:mm AM/PM)
      const timeString = newAppointment.time.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
      const formattedTime = timeString;

      // Create a new date object for comparison without timezone offset
      const currentDate = new Date();
      const appointmentDate = new Date(year, selectedDate.getMonth(), day);
      appointmentDate.setHours(newAppointment.time.getHours());
      appointmentDate.setMinutes(newAppointment.time.getMinutes());

      // Check if appointment is in the past
      if (appointmentDate < currentDate) {
        Alert.alert('Error', 'Cannot create appointments for past dates and times');
        setIsLoading(false);
        return;
      }

      const uniqueTitle = await generateUniqueTitle(newAppointment.title.trim());
      const appointmentData = {
        title: uniqueTitle,
        with: newAppointment.with.trim(),
        date: formattedDate,
        time: formattedTime,
        place: newAppointment.place.trim(),
        description: newAppointment.description?.trim() || '',
        department: newAppointment.department.trim(),
        status: 'upcoming',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      };

      await db.collection('appointments')
        .doc(userEmail)
        .set({
          [uniqueTitle]: appointmentData
        }, { merge: true });

      setConfirmationPopupVisible(false);
      setModalVisible(false);
      setNewlyCreatedAppointment(appointmentData);
      setSuccessModalVisible(true);
      
      // Reset form
      setNewAppointment({
        title: '',
        with: '',
        date: new Date(),
        time: new Date(),
        place: '',
        description: '',
        department: '',
      });

    } catch (error) {
      console.error('Error adding appointment:', error);
      Alert.alert('Error', 'Failed to create appointment. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to format time in 12-hour format
  const format12HourTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      // Create new date object without timezone conversion
      const year = selectedDate.getFullYear();
      const month = selectedDate.getMonth();
      const day = selectedDate.getDate();
      const newDate = new Date(year, month, day);
      
      // Keep the same time
      const currentTime = newAppointment.time;
      newDate.setHours(currentTime.getHours());
      newDate.setMinutes(currentTime.getMinutes());
      
      setNewAppointment({ ...newAppointment, date: newDate });
    }
  };

  const handleTimeChange = (event, selectedTime) => {
    setShowTimePicker(false);
    if (selectedTime) {
      // Ensure we keep the same date when changing time
      const newTime = new Date(selectedTime);
      const currentDate = newAppointment.date;
      newTime.setFullYear(currentDate.getFullYear());
      newTime.setMonth(currentDate.getMonth());
      newTime.setDate(currentDate.getDate());
      
      setNewAppointment({ ...newAppointment, time: newTime });
    }
  };

  const deleteAppointment = async (title) => {
    try {
      await db.collection('appointments')
        .doc(userEmail)
        .update({
          [title]: firebase.firestore.FieldValue.delete()
        });
    } catch (error) {
      console.error('Error deleting appointment:', error);
    }
  };

  const handleMarkAsCompleted = async (title) => {
    setSelectedAppointment(appointments.find(app => app.id === title));
    setConfirmModalVisible(true);
  };

  const confirmComplete = async () => {
    try {
      if (selectedAppointment) {
        await deleteAppointment(selectedAppointment.id);
        setConfirmModalVisible(false);
        setSelectedAppointment(null);
      }
    } catch (error) {
      console.error('Error marking appointment as completed:', error);
      Alert.alert('Error', 'Failed to mark appointment as completed');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'upcoming':
        return '#2EC4B6';
      case 'completed':
        return '#90BE6D';
      case 'cancelled':
        return '#F94144';
      default:
        return '#6C757D';
    }
  };

  const ConfirmationPopup = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={confirmationPopupVisible}
      onRequestClose={() => setConfirmationPopupVisible(false)}
    >
      <View style={styles.confirmModalContainer}>
        <View style={styles.confirmModalContent}>
          <View style={styles.confirmIconContainer}>
            <Icon name="calendar-plus" size={50} color="#2EC4B6" />
          </View>
          <Text style={styles.confirmTitle}>Confirm Appointment</Text>
          <View style={styles.appointmentPreview}>
            <Text style={styles.previewTitle}>{newAppointment.title}</Text>
            <Text style={styles.previewDetail}>With: {newAppointment.with}</Text>
            <Text style={styles.previewDetail}>
              {newAppointment.date.toLocaleDateString()} • {newAppointment.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={styles.previewDetail}>{newAppointment.place}</Text>
            <Text style={styles.previewDetail}>{newAppointment.department}</Text>
          </View>
          <View style={styles.confirmButtonsContainer}>
            <TouchableOpacity
              style={[styles.confirmButton, styles.cancelButton]}
              onPress={() => setConfirmationPopupVisible(false)}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, styles.editButton]}
              onPress={() => {
                setConfirmationPopupVisible(false);
              }}
              disabled={isLoading}
            >
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, styles.continueButton]}
              onPress={proceedWithAppointment}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.continueButtonText}>Continue</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const renderAppointment = ({ item }) => (
    <Card style={styles.appointmentCard}>
      <Card.Content>
        <View style={styles.appointmentHeader}>
          <View style={styles.appointmentInfo}>
            <Text style={styles.appointmentTitle}>{item.title}</Text>
            <Text style={styles.appointmentWith}>With: {item.with}</Text>
            <Text style={styles.appointmentDetail}>Place: {item.place}</Text>
            <Text style={styles.appointmentDetail}>Department: {item.department}</Text>
            {item.description && (
              <Text style={styles.appointmentDescription}>{item.description}</Text>
            )}
          </View>
          <View style={styles.appointmentStatus}>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>Upcoming</Text>
          </View>
            <Text style={styles.appointmentDate}>{item.date}</Text>
            <Text style={styles.appointmentTime}>{item.time}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.completeButton}
          onPress={() => handleMarkAsCompleted(item.id)}
          disabled={isCompleting}
        >
          {isCompleting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.completeButtonText}>Mark as Completed</Text>
          )}
        </TouchableOpacity>
      </Card.Content>
    </Card>
  );

  const ConfirmationModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={confirmModalVisible}
      onRequestClose={() => setConfirmModalVisible(false)}
    >
      <View style={styles.confirmModalContainer}>
        <View style={styles.confirmModalContent}>
          <View style={styles.confirmIconContainer}>
            <Icon name="check-circle" size={50} color="#2EC4B6" />
          </View>
          <Text style={styles.confirmTitle}>Mark as Complete?</Text>
          <Text style={styles.confirmText}>
            Are you sure you want to mark this appointment as complete?
          </Text>
          {selectedAppointment && (
            <View style={styles.appointmentPreview}>
              <Text style={styles.previewTitle}>{selectedAppointment.title}</Text>
              <Text style={styles.previewDetail}>With: {selectedAppointment.with}</Text>
              <Text style={styles.previewDetail}>{selectedAppointment.date} • {selectedAppointment.time}</Text>
            </View>
          )}
          <View style={styles.confirmButtonsContainer}>
            <TouchableOpacity
              style={[styles.confirmButton, styles.cancelButton]}
              onPress={() => {
                setConfirmModalVisible(false);
                setSelectedAppointment(null);
              }}
              disabled={isCompleting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, styles.continueButton]}
              onPress={confirmComplete}
              disabled={isCompleting}
            >
              {isCompleting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.completeButtonText}>Complete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const SuccessModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={successModalVisible}
      onRequestClose={() => setSuccessModalVisible(false)}
    >
      <View style={styles.confirmModalContainer}>
        <View style={styles.confirmModalContent}>
          <View style={styles.confirmIconContainer}>
            <Icon name="check-circle" size={50} color="#2EC4B6" />
          </View>
          <Text style={styles.confirmTitle}>Success!</Text>
          <Text style={styles.confirmText}>
            Your appointment has been created successfully.
          </Text>
          {newlyCreatedAppointment && (
            <View style={styles.appointmentPreview}>
              <Text style={styles.previewTitle}>{newlyCreatedAppointment.title}</Text>
              <Text style={styles.previewDetail}>With: {newlyCreatedAppointment.with}</Text>
              <Text style={styles.previewDetail}>{newlyCreatedAppointment.date} • {newlyCreatedAppointment.time}</Text>
              <Text style={styles.previewDetail}>{newlyCreatedAppointment.place}</Text>
            </View>
          )}
          <View style={styles.doneButtonContainer}>
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => {
                setSuccessModalVisible(false);
                setNewlyCreatedAppointment(null);
              }}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      {appointments.length === 0 ? (
        <View style={styles.noAppointmentsContainer}>
          <Icon name="calendar-times" size={50} color="#ccc" />
          <Text style={styles.noAppointmentsText}>No upcoming appointments</Text>
          <Text style={styles.noAppointmentsSubText}>Tap the + button to schedule one</Text>
        </View>
      ) : (
      <FlatList
        data={appointments}
        renderItem={renderAppointment}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ConfirmationPopup />

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalContainer}
        >
          <ScrollView contentContainerStyle={styles.modalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>New Appointment</Text>
              
              <TextInput
                style={styles.input}
                placeholder="Appointment Title *"
                placeholderTextColor="#666"
                value={newAppointment.title}
                onChangeText={(text) => setNewAppointment({ ...newAppointment, title: text })}
              />
              
              <TextInput
                style={styles.input}
                placeholder="Meeting With *"
                placeholderTextColor="#666"
                value={newAppointment.with}
                onChangeText={(text) => setNewAppointment({ ...newAppointment, with: text })}
              />

              <TextInput
                style={styles.input}
                placeholder="Place/Location *"
                placeholderTextColor="#666"
                value={newAppointment.place}
                onChangeText={(text) => setNewAppointment({ ...newAppointment, place: text })}
              />

              <TextInput
                style={styles.input}
                placeholder="Department *"
                placeholderTextColor="#666"
                value={newAppointment.department}
                onChangeText={(text) => setNewAppointment({ ...newAppointment, department: text })}
              />

              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description (optional)"
                placeholderTextColor="#666"
                value={newAppointment.description}
                onChangeText={(text) => setNewAppointment({ ...newAppointment, description: text })}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowDatePicker(true);
                }}
              >
                <Text style={styles.dateTimeButtonText}>
                  Date: {newAppointment.date.toLocaleDateString()}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dateTimeButton}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowTimePicker(true);
                }}
              >
                <Text style={styles.dateTimeButtonText}>
                  Time: {format12HourTime(newAppointment.time)}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={newAppointment.date}
                  mode="date"
                  minimumDate={new Date()}
                  onChange={handleDateChange}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={newAppointment.time}
                  mode="time"
                  is24Hour={false}
                  onChange={handleTimeChange}
                />
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelModalButton]}
                  onPress={() => {
                    setModalVisible(false);
                    setNewAppointment({
                      title: '',
                      with: '',
                      date: new Date(),
                      time: new Date(),
                      place: '',
                      description: '',
                      department: '',
                    });
                  }}
                >
                  <Text style={styles.cancelModalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.addModalButton]}
                  onPress={handleAddAppointment}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.addModalButtonText}>Add</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmationModal />
      <SuccessModal />

      <TouchableOpacity 
        style={[styles.addButton, isLoading && styles.addButtonDisabled]}
        onPress={() => setModalVisible(true)}
        disabled={isLoading}
        activeOpacity={0.8}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" size="large" />
        ) : (
          <Icon name="plus" size={24} color="#fff" style={styles.addButtonIcon} />
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  
  listContainer: {
    paddingBottom: 80,
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
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
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
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#2EC4B6',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    zIndex: 999,
  },
  addButtonDisabled: {
    opacity: 0.7,
    backgroundColor: '#ccc',
  },
  addButtonIcon: {
    color: '#fff',
    fontSize: 24,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 12,
    padding: 15,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#F8F9FA',
    color: '#1D3557',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 15,
  },
  dateTimeButton: {
    backgroundColor: '#F8F9FA',
    padding: 15,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeButton: {
    backgroundColor: '#90BE6D',
    padding: 12,
    borderRadius: 12,
    marginTop: 15,
    alignItems: 'center',
  },
  completeButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  noAppointmentsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  noAppointmentsText: {
    fontSize: 18,
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  noAppointmentsSubText: {
    fontSize: 14,
    color: '#999',
  },
  confirmModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  confirmModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    elevation: 5,
  },
  confirmIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F8F7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  confirmTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  appointmentPreview: {
    width: '100%',
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 8,
  },
  previewDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  confirmButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDE2E5',
  },
  editButton: {
    backgroundColor: '#E9ECEF',
    borderWidth: 1,
    borderColor: '#DDE2E5',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  editButtonText: {
    color: '#1D3557',
    fontSize: 14,
    fontWeight: '600',
  },
  continueButton: {
    backgroundColor: '#2EC4B6',
  },
  continueButtonText: {
    padding: 10,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confirmText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  dateTimeButtonText: {
    color: '#1D3557',
    fontSize: 16,
  },
  cancelModalButton: {
    backgroundColor: '#F8F9FA',
    borderWidth: 1,
    borderColor: '#DDE2E5',
  },
  addModalButton: {
    backgroundColor: '#2EC4B6',
  },
  cancelModalButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  addModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButtonContainer: {
    width: '100%',
    marginTop: 20,
  },
  doneButton: {
    backgroundColor: '#2EC4B6',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default AppointmentsScreen; 