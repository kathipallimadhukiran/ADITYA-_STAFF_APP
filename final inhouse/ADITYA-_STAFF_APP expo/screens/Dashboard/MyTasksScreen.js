import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  AppState,
  Animated,
  Easing,
  Dimensions,
  Pressable
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth, db } from '../../services/Firebase/firebaseConfig';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy, getDoc, setDoc, arrayUnion } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { useNavigation, useFocusEffect } from '@react-navigation/native';

const { width, height } = Dimensions.get('window');

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

const TaskItem = React.memo(({ item, index, onUpdate, onDelete }) => {
  const translateX = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  
  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 100),
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        })
      ])
    ]).start();
  }, [index]);

  return (
    <Animated.View 
      style={[
        styles.taskCard,
        item.priority === 'high' && styles.highPriority,
        item.priority === 'medium' && styles.mediumPriority,
        item.priority === 'low' && styles.lowPriority,
        {
          opacity,
          transform: [{ translateX }],
        }
      ]}
    >
      <View style={styles.taskHeader}>
        <Text style={styles.taskTitle}>{item.title}</Text>
        <View style={styles.taskActions}>
          <TouchableOpacity 
            onPress={() => onUpdate(item.id, 'completed')}
            style={styles.actionButton}
          >
            <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => onDelete(item.id)}
            style={styles.actionButton}
          >
            <Ionicons name="trash" size={24} color="#F44336" />
          </TouchableOpacity>
        </View>
      </View>
      {item.description && (
        <Text style={styles.taskDescription}>{item.description}</Text>
      )}
      <View style={styles.taskFooter}>
        <View style={styles.deadlineContainer}>
          <Ionicons name="calendar" size={16} color="#6b7280" />
          <Text style={styles.taskDeadline}>
            {item.deadline ? new Date(item.deadline).toLocaleString() : 'No deadline'}
          </Text>
        </View>
        <View style={[
          styles.statusBadge,
          item.status === 'completed' ? styles.completedBadge : styles.pendingBadge
        ]}>
          <Text style={styles.statusText}>
            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
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
    priority: 'high',
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

  // Animation values
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const modalAnimationRef = useRef(null);

  // Add back the animation functions
  const animateModalIn = () => {
    if (modalAnimationRef.current) {
      modalAnimationRef.current.stop();
    }

    scaleAnim.setValue(0.3);
    
    modalAnimationRef.current = Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 7
    });

    modalAnimationRef.current.start();
  };

  const animateModalOut = (callback) => {
    if (modalAnimationRef.current) {
      modalAnimationRef.current.stop();
    }

    modalAnimationRef.current = Animated.timing(scaleAnim, {
      toValue: 0.3,
      duration: 200,
      useNativeDriver: true,
      easing: Easing.ease
    });

    modalAnimationRef.current.start(callback);
  };

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

  const handleOpenModal = () => {
    console.log('Opening modal');
    setModalVisible(true);
    requestAnimationFrame(() => {
      animateModalIn();
    });
  };

  const handleCloseModal = () => {
    console.log('Closing modal');
    animateModalOut(() => {
      setModalVisible(false);
      resetModalStates();
    });
  };

  const renderTaskItem = useCallback(({ item, index }) => (
    <TaskItem 
      item={item} 
      index={index}
      onUpdate={handleUpdateTask}
      onDelete={handleDeleteTask}
    />
  ), []);

  const renderEmptyComponent = () => (
    <View style={styles.emptyState}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#f97316" />
          <Text style={styles.loadingText}>Loading tasks...</Text>
        </View>
      ) : (
        <>
          <Ionicons name="document-text-outline" size={72} color="#e5e7eb" />
          <Text style={styles.emptyTitle}>No tasks yet</Text>
          <Text style={styles.emptySubtitle}>Tap the + button to create your first task</Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}></Text>
        <TouchableOpacity style={styles.filterButton}>
          <Ionicons name="filter" size={24} color="#f97316" />
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
            colors={['#f97316']}
            tintColor="#f97316"
            progressBackgroundColor="#fff"
          />
        }
        ListEmptyComponent={renderEmptyComponent}
        showsVerticalScrollIndicator={false}
      />

      <View style={styles.fabContainer}>
        <TouchableOpacity 
          style={styles.fab}
          onPress={handleOpenModal}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={30} color="white" />
        </TouchableOpacity>
      </View>

      {modalVisible && (
        <Modal
          animationType="none"
          transparent={true}
          visible={true}
          onRequestClose={handleCloseModal}
          statusBarTranslucent
        >
          <Pressable 
            style={styles.modalOverlay} 
            onPress={handleCloseModal}
          >
            <Pressable style={styles.modalContainer} onPress={e => e.stopPropagation()}>
              <Animated.View style={[
                styles.modalContent,
                {
                  transform: [{ scale: scaleAnim }]
                }
              ]}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Add New Task</Text>
                  <TouchableOpacity 
                    onPress={handleCloseModal}
                    style={styles.closeButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <ScrollView 
                  style={styles.modalBody}
                  contentContainerStyle={styles.modalBodyContent}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Title</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter task title"
                      placeholderTextColor="#9ca3af"
                      value={newTask.title}
                      onChangeText={(text) => setNewTask({...newTask, title: text})}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Description</Text>
                    <TextInput
                      style={[styles.input, styles.multilineInput]}
                      placeholder="Enter task description (optional)"
                      placeholderTextColor="#9ca3af"
                      multiline
                      numberOfLines={4}
                      value={newTask.description}
                      onChangeText={(text) => setNewTask({...newTask, description: text})}
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Deadline</Text>
                    <TouchableOpacity 
                      style={[styles.input, styles.deadlineInput]} 
                      onPress={handleDeadlinePress}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="calendar-outline" size={20} color="#6b7280" style={styles.deadlineIcon} />
                      <Text style={styles.deadlineText}>
                        {newTask.deadline ? newTask.deadline.toLocaleString() : 'Select date and time'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {showDatePicker && (
                    <DateTimePicker
                      value={tempDeadline}
                      mode="date"
                      display="spinner"
                      onChange={onDateChange}
                      minimumDate={new Date()}
                      themeVariant="light"
                      textColor="#000"
                    />
                  )}

                  {showTimePicker && (
                    <DateTimePicker
                      value={tempDeadline}
                      mode="time"
                      display="spinner"
                      onChange={onTimeChange}
                      is24Hour={false}
                      themeVariant="light"
                    />
                  )}

                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>Priority</Text>
                    <View style={styles.priorityOptions}>
                      {['low', 'medium', 'high'].map(level => (
                        <TouchableOpacity
                          key={level}
                          style={[
                            styles.priorityOption,
                            newTask.priority === level && styles[`${level}PriorityOption`]
                          ]}
                          onPress={() => setNewTask({...newTask, priority: level})}
                          activeOpacity={0.7}
                        >
                          <Ionicons 
                            name={
                              level === 'high' ? 'flag' : 
                              level === 'medium' ? 'flag-outline' : 'flag-sharp'
                            } 
                            size={18} 
                            color={newTask.priority === level ? '#fff' : 
                              level === 'high' ? '#ef4444' : 
                              level === 'medium' ? '#f59e0b' : '#10b981'}
                            style={styles.priorityIcon}
                          />
                          <Text style={[
                            styles.priorityText,
                            newTask.priority === level && styles.selectedPriorityText
                          ]}>
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  <TouchableOpacity 
                    style={styles.saveButton}
                    onPress={handleAddTask}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.saveButtonText}>Create Task</Text>
                  </TouchableOpacity>
                </ScrollView>
              </Animated.View>
            </Pressable>
          </Pressable>
        </Modal>
      )}

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
    backgroundColor: '#f8fafc' 
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: '#f8fafc',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1D3557',
  },
  filterButton: {
    padding: 8,
  },
  taskList: { 
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  taskCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  highPriority: { 
    borderLeftWidth: 4, 
    borderLeftColor: '#F94144',
    backgroundColor: '#fef2f2',
  },
  mediumPriority: { 
    borderLeftWidth: 4, 
    borderLeftColor: '#F8961E',
    backgroundColor: '#fffbeb',
  },
  lowPriority: { 
    borderLeftWidth: 4, 
    borderLeftColor: '#90BE6D',
    backgroundColor: '#ecfdf5',
  },
  taskHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: 8,
  },
  taskTitle: { 
    fontSize: 18, 
    fontWeight: '600', 
    color: '#1D3557',
    flex: 1,
  },
  taskActions: { 
    flexDirection: 'row', 
    gap: 12,
  },
  actionButton: {
    padding: 4,
  },
  taskDescription: { 
    color: '#457B9D',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  taskFooter: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
  },
  deadlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskDeadline: { 
    fontSize: 13, 
    color: '#457B9D',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadge: {
    backgroundColor: '#ffedd5',
  },
  completedBadge: {
    backgroundColor: '#dcfce7',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
    color: '#1D3557',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    marginTop: 16,
    color: '#1D3557',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    color: '#457B9D',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: '80%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#1D3557',
    fontSize: 16,
  },
  fabContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1D3557',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    backgroundColor: 'transparent',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1D3557',
  },
  closeButton: {
    padding: 4,
  },
  modalBody: {
    maxHeight: height * 0.7,
  },
  modalBodyContent: {
    padding: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1D3557',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1D3557',
    backgroundColor: '#fff',
  },
  multilineInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  deadlineInput: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deadlineIcon: {
    marginRight: 12,
  },
  deadlineText: {
    color: '#1D3557',
    fontSize: 16,
  },
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  highPriorityOption: {
    backgroundColor: '#F94144',
    borderColor: '#F94144',
  },
  mediumPriorityOption: {
    backgroundColor: '#F8961E',
    borderColor: '#F8961E',
  },
  lowPriorityOption: {
    backgroundColor: '#90BE6D',
    borderColor: '#90BE6D',
  },
  priorityIcon: {
    marginRight: 4,
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#457B9D',
  },
  selectedPriorityText: {
    color: 'white',
  },
  saveButton: {
    marginTop: 24,
    backgroundColor: '#1D3557',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  pastTimeModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pastTimeModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    elevation: 5,
    margin: 20,
    width: '85%',
    maxWidth: 350,
  },
  pastTimeModalHeader: {
    marginBottom: 15,
  },
  pastTimeModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 10,
    textAlign: 'center',
  },
  pastTimeModalMessage: {
    fontSize: 16,
    color: '#457B9D',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  pastTimeModalButtons: {
    width: '100%',
    gap: 10,
  },
  timeButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    width: '100%',
    elevation: 2,
  },
  changeTimeButton: {
    backgroundColor: '#1D3557',
  },
  oneHourButton: {
    backgroundColor: '#457B9D',
  },
  timeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default MyTasksScreen;
