import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
  ActivityIndicator,
  AppState
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, db } from '../../services/Firebase/firebaseConfig';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: 'max'
  }),
});

const MyTasksScreen = () => {
  const navigation = useNavigation();
  const [tasks, setTasks] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pushToken, setPushToken] = useState(null);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    deadline: null,
    priority: 'medium',
    status: 'pending',
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDeadline, setTempDeadline] = useState(new Date());
  const [showPastTimeModal, setShowPastTimeModal] = useState(false);
  
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const appState = useRef(AppState.currentState);
  const alertedTasksRef = useRef(new Set());

  // Initialize notifications and background tasks
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Request notification permissions
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          Alert.alert('Error', 'Failed to get notification permissions. Please enable them in settings.');
          return;
        }

        // Get push token
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        setPushToken(token);

        console.log('App initialized successfully');
      } catch (error) {
        console.error('Failed to initialize app:', error);
      }
    };

    initializeApp();
  }, []);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        fetchTasks();
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Auto-reload when screen becomes active
  useFocusEffect(
    React.useCallback(() => {
      if (currentUser) {
        setIsLoading(true);
        fetchTasks().finally(() => setIsLoading(false));
      }
      return () => {};
    }, [currentUser])
  );

  // Redirect to login if no user
  useEffect(() => {
    if (!currentUser) {
      navigation.navigate('Login');
    }
  }, [currentUser, navigation]);

  useEffect(() => {
    // This listener is called whenever a notification is received while the app is foregrounded
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Setup interval to check alerts every minute
    const interval = setInterval(() => {
      checkTaskAlerts();
    }, 60 * 1000); // every 1 minute

    // Also check immediately once
    checkTaskAlerts();

    return () => clearInterval(interval);
  }, [tasks]);

  // Handle notification response
  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const taskId = response.notification.request.content.data.taskId;
      // You can add navigation to task details here if needed
      console.log('Notification tapped:', taskId);
    });

    return () => {
      responseListener.remove();
    };
  }, []);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    fetchTasks().finally(() => {
      setRefreshing(false);
      setIsLoading(false);
    });
  }, []);

  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      
      const userTasksRef = doc(db, 'tasks', currentUser.email);
      const userTasksDoc = await getDoc(userTasksRef);
      
      if (!userTasksDoc.exists()) {
        setTasks([]);
        return;
      }

      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000));
      
      const allTasks = userTasksDoc.data().tasks || [];
      const validTasks = allTasks.filter(task => {
        const completedAt = task.completedAt ? new Date(task.completedAt) : null;
        return !(task.status === 'completed' && completedAt && completedAt < twelveHoursAgo);
      });

      if (validTasks.length !== allTasks.length) {
        await updateDoc(userTasksRef, { tasks: validTasks });
      }

      validTasks.sort((a, b) => {
        const dateA = new Date(a.createdAt);
        const dateB = new Date(b.createdAt);
        return dateB - dateA;
      });
      
      setTasks(validTasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      Alert.alert('Error', 'Failed to fetch tasks. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset all modal states
  const resetModalStates = () => {
    setNewTask({
      title: '',
      description: '',
      deadline: null,
      priority: 'medium',
      status: 'pending',
    });
    setShowDatePicker(false);
    setShowTimePicker(false);
    setTempDeadline(new Date());
  };

  // Close modal and reset states
  const handleCloseModal = () => {
    setModalVisible(false);
    resetModalStates();
  };

  // Date/Time picker handling
  const handleDeadlinePress = () => {
    setShowDatePicker(true);
  };

  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      const now = new Date();
      const updatedDate = new Date(selectedDate);
      updatedDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
      
      setTempDeadline(updatedDate);
      setShowTimePicker(true);
    }
  };

  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const now = new Date();
      const updatedDate = new Date(tempDeadline);
      updatedDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);

      if (updatedDate.toDateString() === now.toDateString() && updatedDate < now) {
        setShowPastTimeModal(true);
        return;
      }

      setTempDeadline(updatedDate);
      setNewTask({...newTask, deadline: updatedDate});
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim() || !newTask.deadline) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      const taskId = Date.now().toString();
      const newTaskData = {
        id: taskId,
        ...newTask,
        deadline: newTask.deadline.toISOString(),
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      const userTasksRef = doc(db, 'tasks', currentUser.email);
      const userTasksDoc = await getDoc(userTasksRef);

      if (!userTasksDoc.exists()) {
        await setDoc(userTasksRef, { tasks: [newTaskData] });
      } else {
        await updateDoc(userTasksRef, {
          tasks: arrayUnion(newTaskData),
        });
      }

      // Send only task creation notification
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '✨ New Task Created',
          body: `Task: ${newTask.title}\nDescription: ${newTask.description}\nDue: ${new Date(newTask.deadline).toLocaleString()}`,
          data: { taskId, type: 'task-created' },
          sound: 'default',
          priority: 'high',
          badge: 1,
          vibrate: [0, 250, 250, 250],
          color: '#4CAF50',
          android: {
            channelId: 'task-notifications',
            importance: 'high',
            priority: 'high',
          },
          ios: {
            sound: true,
            priority: 1
          }
        },
        trigger: null // Immediate notification for task creation
      });

      handleCloseModal();
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task');
    }
  };

  const handleUpdateTask = async (taskId, updatedStatus) => {
    try {
      const userTasksRef = doc(db, 'tasks', currentUser.email);
      const userTasksDoc = await getDoc(userTasksRef);
      
      if (!userTasksDoc.exists()) {
        Alert.alert('Error', 'No tasks found');
        return;
      }

      const tasks = userTasksDoc.data().tasks;
      const taskIndex = tasks.findIndex(task => task.id === taskId);
      
      if (taskIndex === -1) {
        Alert.alert('Error', 'Task not found');
        return;
      }

      const updatedTasks = [...tasks];
      updatedTasks[taskIndex] = {
        ...updatedTasks[taskIndex],
        status: updatedStatus,
        updatedAt: new Date().toISOString(),
        completedAt: updatedStatus === 'completed' ? new Date().toISOString() : null
      };

      await setDoc(userTasksRef, { tasks: updatedTasks });
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      const userTasksRef = doc(db, 'tasks', currentUser.email);
      const userTasksDoc = await getDoc(userTasksRef);
      
      if (!userTasksDoc.exists()) return;

      const currentTasks = userTasksDoc.data().tasks || [];
      const updatedTasks = currentTasks.filter(task => task.id !== taskId);

      await updateDoc(userTasksRef, { tasks: updatedTasks });
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      Alert.alert('Error', 'Failed to delete task');
    }
  };

  // Check tasks deadlines and alert user if deadlines are near
  const checkTaskAlerts = () => {
    const now = new Date();

    tasks.forEach(task => {
      if (!task.deadline || task.status === 'completed') return;

      const deadline = task.deadline instanceof Date ? task.deadline : new Date(task.deadline);
      const diffMs = deadline - now;
      const diffMinutes = diffMs / (1000 * 60);

      // Check if alert already shown for this task + timeframe
      const alertedKey1d = `${task.id}-1d`;
      const alertedKey1h = `${task.id}-1h`;
      const alertedKey30m = `${task.id}-30m`;

      // 1 hour before (60 minutes)
      if (diffMinutes <= 60 && diffMinutes > 59 && !alertedTasksRef.current.has(alertedKey1h)) {
        Alert.alert('Reminder', `Your task "${task.title}" is due in 1 hour.`);
        alertedTasksRef.current.add(alertedKey1h);
      }

      // 30 minutes before
      if (diffMinutes <= 30 && diffMinutes > 29 && !alertedTasksRef.current.has(alertedKey30m)) {
        Alert.alert('Reminder', `Your task "${task.title}" is due in 30 minutes.`);
        alertedTasksRef.current.add(alertedKey30m);
      }
    });
  };

  const renderTaskItem = ({ item }) => (
    <View style={[
      styles.taskCard,
      item.priority === 'high' && styles.highPriority,
      item.priority === 'medium' && styles.mediumPriority,
      item.priority === 'low' && styles.lowPriority
    ]}>
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle}>{item.title}</Text>
        <View style={styles.taskActions}>
          <TouchableOpacity onPress={() => handleUpdateTask(item.id, 'completed')}>
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleDeleteTask(item.id)}>
            <Ionicons name="trash" size={24} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>
      <Text style={styles.taskDescription}>{item.description}</Text>
      <View style={styles.taskFooter}>
        <Text style={styles.taskDeadline}>
          <Ionicons name="calendar" size={16} color="#555" />{' '}
          {item.deadline ? new Date(item.deadline).toLocaleString() : 'No deadline'}
        </Text>
        <Text style={[
          styles.taskStatus,
          item.status === 'completed' && styles.completedStatus
        ]}>
          {item.status}
        </Text>
      </View>
    </View>
  );

  const renderEmptyComponent = () => (
    <View style={styles.emptyState}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <>
          <Ionicons name="document-text" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No tasks assigned yet</Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.taskList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#f97316']}
            tintColor="#f97316"
          />
        }
        ListEmptyComponent={renderEmptyComponent}
      />

      <TouchableOpacity 
        style={styles.fab}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={30} color="white" />
      </TouchableOpacity>

      {/* Add Task Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Task</Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title*</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter task title"
                placeholderTextColor="#999"
                value={newTask.title}
                onChangeText={(text) => setNewTask({...newTask, title: text})}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter task description"
                placeholderTextColor="#999"
                multiline
                numberOfLines={4}
                value={newTask.description}
                onChangeText={(text) => setNewTask({...newTask, description: text})}
              />

              <Text style={styles.inputLabel}>Deadline*</Text>
              <TouchableOpacity 
                style={[styles.input, styles.deadlineInput]} 
                onPress={handleDeadlinePress}
              >
                <Text style={styles.deadlineText}>
                  {newTask.deadline ? newTask.deadline.toLocaleString() : 'Select date and time'}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={tempDeadline}
                  mode="date"
                  display="default"
                  onChange={onDateChange}
                  minimumDate={new Date()}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={tempDeadline}
                  mode="time"
                  display="default"
                  onChange={onTimeChange}
                  is24Hour={false}
                />
              )}

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.priorityOptions}>
                {['low', 'medium', 'high'].map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.priorityOption,
                      newTask.priority === level && styles.selectedPriority
                    ]}
                    onPress={() => setNewTask({...newTask, priority: level})}
                  >
                    <Text style={[
                      styles.priorityText,
                      newTask.priority === level && styles.selectedPriorityText
                    ]}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleAddTask}
              >
                <Text style={styles.saveButtonText}>Save Task</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Past Time Warning Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPastTimeModal}
        onRequestClose={() => setShowPastTimeModal(false)}
      >
        <View style={styles.pastTimeModalContainer}>
          <View style={styles.pastTimeModalContent}>
            <View style={styles.pastTimeModalHeader}>
              <Ionicons name="warning" size={40} color="#f97316" />
            </View>
            <Text style={styles.pastTimeModalTitle}>Past Time Selected</Text>
            <Text style={styles.pastTimeModalMessage}>
              Please select a valid time for your task.
            </Text>
            <View style={styles.pastTimeModalButtons}>
              <TouchableOpacity
                style={[styles.timeButton, styles.changeTimeButton]}
                onPress={() => {
                  setShowPastTimeModal(false);
                  setShowTimePicker(true);
                }}
              >
                <Text style={styles.timeButtonText}>Change Time</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.timeButton, styles.oneHourButton]}
                onPress={() => {
                  const oneHourLater = new Date();
                  oneHourLater.setHours(oneHourLater.getHours() + 1);
                  setTempDeadline(oneHourLater);
                  setNewTask({...newTask, deadline: oneHourLater});
                  setShowPastTimeModal(false);
                }}
              >
                <Text style={styles.timeButtonText}>Set After 1 Hour</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f9f9f9' 
  },
  taskList: { 
    padding: 10,
    paddingBottom: 90
  },
  taskCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4
  },
  highPriority: { borderLeftWidth: 6, borderLeftColor: '#e53935' },
  mediumPriority: { borderLeftWidth: 6, borderLeftColor: '#fbc02d' },
  lowPriority: { borderLeftWidth: 6, borderLeftColor: '#43a047' },
  taskHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  taskTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#333',
    flex: 1,
    marginRight: 10
  },
  taskActions: { 
    flexDirection: 'row', 
    gap: 15 
  },
  taskDescription: { 
    marginVertical: 8, 
    color: '#555',
    fontSize: 14,
    lineHeight: 20
  },
  taskFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 5
  },
  taskDeadline: { 
    fontSize: 12, 
    color: '#666' 
  },
  taskStatus: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    color: '#ff9800',
    textTransform: 'capitalize'
  },
  completedStatus: { 
    color: '#4caf50' 
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50
  },
  emptyText: {
    marginTop: 10,
    color: '#999',
    fontSize: 16
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50
  },
  loadingText: {
    marginTop: 10,
    color: '#f97316',
    fontSize: 16
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#f97316',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    maxHeight: '90%',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f97316',
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white'
  },
  modalBody: {
    padding: 20
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
    marginBottom: 16,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fff'
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
    paddingTop: 12
  },
  inputLabel: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#333',
    marginBottom: 4
  },
  priorityOptions: {
    flexDirection: 'row',
    marginTop: 8,
    marginBottom: 16,
    gap: 10
  },
  priorityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#fff'
  },
  selectedPriority: {
    backgroundColor: '#f97316',
    borderColor: '#f97316'
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666'
  },
  selectedPriorityText: {
    color: 'white'
  },
  deadlineInput: {
    justifyContent: 'center',
    minHeight: 45
  },
  deadlineText: {
    color: '#333',
    fontSize: 16
  },
  saveButton: {
    marginTop: 24,
    marginBottom: 16,
    backgroundColor: '#f97316',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16
  },
  pastTimeModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  pastTimeModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    elevation: 5,
    margin: 20,
    width: '85%',
    maxWidth: 350
  },
  pastTimeModalHeader: {
    marginBottom: 15
  },
  pastTimeModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center'
  },
  pastTimeModalMessage: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22
  },
  pastTimeModalButtons: {
    width: '100%',
    gap: 10
  },
  timeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    elevation: 2
  },
  changeTimeButton: {
    backgroundColor: '#f97316'
  },
  oneHourButton: {
    backgroundColor: '#2563eb'
  },
  timeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center'
  }
});

export default MyTasksScreen;
