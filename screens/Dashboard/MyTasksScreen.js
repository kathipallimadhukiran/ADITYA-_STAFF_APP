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
  ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, db } from '../../services/Firebase/firebaseConfig';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import scheduleNotifications from '../../services/scheduleNotifications';
import * as Notifications from 'expo-notifications';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const MyTasksScreen = () => {
  const navigation = useNavigation();
  const [tasks, setTasks] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
  const auth = getAuth();
  const currentUser = auth.currentUser;

  // Redirect to login if no user
  useEffect(() => {
    if (!currentUser) {
      navigation.navigate('Login');
      return;
    }
  }, [currentUser, navigation]);

  // Ref to keep track of alerted tasks to prevent multiple alerts
  const alertedTasksRef = useRef(new Set());

  // Add useFocusEffect for auto-reload when screen becomes active
  useFocusEffect(
    React.useCallback(() => {
      if (currentUser) {
        setIsLoading(true);
        fetchTasks().finally(() => setIsLoading(false));
      }
      return () => {}; // cleanup if needed
    }, [currentUser])
  );

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
      const q = query(
        collection(db, 'facultyTasks'),
        where('facultyId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const now = new Date();
      const twelveHoursAgo = new Date(now.getTime() - (12 * 60 * 60 * 1000)); // 12 hours ago
      const deletePromises = [];
      const validTasks = [];

      querySnapshot.docs.forEach(doc => {
        const taskData = doc.data();
        const deadline = taskData.deadline ? new Date(taskData.deadline) : null;
        const completedAt = taskData.completedAt ? new Date(taskData.completedAt) : null;
        
        // Delete completed tasks after 12 hours
        if (taskData.status === 'completed' && completedAt && completedAt < twelveHoursAgo) {
          deletePromises.push(deleteDoc(doc.ref));
        } else {
          // Keep task if it's not completed or completed less than 12 hours ago
          validTasks.push({
            id: doc.id,
            ...taskData,
            deadline: deadline,
            completedAt: completedAt
          });
        }
      });

      // Execute all delete operations
      if (deletePromises.length > 0) {
        await Promise.all(deletePromises);
        console.log(`Deleted ${deletePromises.length} completed tasks older than 12 hours`);
      }

      setTasks(validTasks);
    } catch (error) {
      console.error('Error fetching/cleaning up tasks:', error);
      Alert.alert('Error', 'Failed to fetch tasks. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) {
      Alert.alert('Validation', 'Please enter a task title.');
      return;
    }
    if (!newTask.deadline) {
      Alert.alert('Validation', 'Please select a deadline date and time.');
      return;
    }

    try {
      // Save task to Firestore
      const taskData = {
        ...newTask,
        deadline: newTask.deadline.toISOString(),
        facultyId: currentUser.uid,
        createdAt: serverTimestamp(),
        status: 'pending',
      };
      
      // Add to Firestore and get the document reference
      const docRef = await addDoc(collection(db, 'facultyTasks'), taskData);
      
      // Schedule notifications with the actual document ID
      await scheduleNotifications({
        ...taskData,
        id: docRef.id, // Use the actual Firestore document ID
        title: newTask.title,
        deadline: newTask.deadline,
      });

      setModalVisible(false);
      setNewTask({
        title: '',
        description: '',
        deadline: null,
        priority: 'medium',
        status: 'pending',
      });

      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task. Please try again.');
    }
  };

  const handleUpdateTask = async (taskId, updatedStatus) => {
    try {
      const updateData = {
        status: updatedStatus
      };
      
      // Add completedAt timestamp when task is marked as completed
      if (updatedStatus === 'completed') {
        updateData.completedAt = new Date().toISOString();
      }
      
      await updateDoc(doc(db, 'facultyTasks', taskId), updateData);
      fetchTasks();
    } catch (error) {
      console.error('Error updating task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await deleteDoc(doc(db, 'facultyTasks', taskId));
      fetchTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  // Show date picker first, then time picker
  const handleDeadlinePress = () => {
    setShowDatePicker(true);
  };

  // Date picker change handler
  const onDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      // Update tempDeadline's date, keep time same for now
      let updatedDate = new Date(tempDeadline);
      updatedDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      setTempDeadline(updatedDate);

      // Show time picker next
      setShowTimePicker(true);
    }
  };

  // Time picker change handler
  const onTimeChange = (event, selectedTime) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      let updatedDate = new Date(tempDeadline);
      updatedDate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
      setTempDeadline(updatedDate);

      // Save final deadline to newTask
      setNewTask({...newTask, deadline: updatedDate});
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

      // 1 day before (1440 minutes)
      if (diffMinutes <= 1440 && diffMinutes > 1439 && !alertedTasksRef.current.has(alertedKey1d)) {
        Alert.alert('Reminder', `Your task "${task.title}" is due in 1 day.`);
        alertedTasksRef.current.add(alertedKey1d);
      }

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
          <ActivityIndicator size="large" color="#6200ee" />
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Tasks</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Ionicons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={tasks}
        renderItem={renderTaskItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.taskList}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#6200ee']}
            tintColor="#6200ee"
          />
        }
        ListEmptyComponent={renderEmptyComponent}
      />

      {/* Add Task Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Task</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={24} color="#555" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title*</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter task title"
                value={newTask.title}
                onChangeText={(text) => setNewTask({...newTask, title: text})}
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter task description"
                multiline
                numberOfLines={4}
                value={newTask.description}
                onChangeText={(text) => setNewTask({...newTask, description: text})}
              />

              <Text style={styles.inputLabel}>Deadline</Text>
              <TouchableOpacity 
                style={styles.input} 
                onPress={handleDeadlinePress}
              >
                <Text>
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
                    <Text style={styles.priorityText}>{level.charAt(0).toUpperCase() + level.slice(1)}</Text>
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 15, 
    backgroundColor: '#6200ee' 
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: 'white' },
  addButton: {
    backgroundColor: '#3700b3',
    borderRadius: 20,
    padding: 8
  },
  taskList: { padding: 10 },
  taskCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    elevation: 2
  },
  highPriority: { borderLeftWidth: 6, borderLeftColor: '#e53935' },
  mediumPriority: { borderLeftWidth: 6, borderLeftColor: '#fbc02d' },
  lowPriority: { borderLeftWidth: 6, borderLeftColor: '#43a047' },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { fontSize: 18, fontWeight: 'bold' },
  taskActions: { flexDirection: 'row', gap: 15 },
  taskDescription: { marginVertical: 8, color: '#555' },
  taskFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskDeadline: { fontSize: 12, color: '#555' },
  taskStatus: { fontSize: 12, fontWeight: 'bold', color: '#ff9800' },
  completedStatus: { color: '#4caf50' },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50
  },
  emptyText: {
    marginTop: 10,
    color: '#aaa',
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
    color: '#6200ee',
    fontSize: 16
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    maxHeight: '90%'
  },
  modalHeader: {
    flexDirection: 'row', 
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  modalTitle: { fontSize: 18, fontWeight: 'bold' },
  modalBody: { padding: 15 },
  inputLabel: { fontWeight: 'bold', marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 5
  },
  multilineInput: { height: 80, textAlignVertical: 'top' },
  priorityOptions: { flexDirection: 'row', marginTop: 5 },
  priorityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ccc',
    marginHorizontal: 5,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center'
  },
  selectedPriority: {
    backgroundColor: '#6200ee',
    borderColor: '#6200ee'
  },
  priorityText: {
    color: 'black'
  },
  saveButton: {
    marginTop: 20,
    backgroundColor: '#6200ee',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center'
  },
  saveButtonText: { color: 'white', fontWeight: 'bold', fontSize: 16 }
});

export default MyTasksScreen;
