import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Modal, 
  TextInput, 
  ScrollView,
  Platform 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db, auth } from '../../services/firebaseConfig';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';

const FacultyTasksScreen = () => {
  const [tasks, setTasks] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    deadline: null,
    priority: 'medium',
    status: 'pending'
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (currentUser) {
      fetchTasks();
    }
  }, [currentUser]);

  const fetchTasks = async () => {
    try {
      const q = query(
        collection(db, 'facultyTasks'),
        where('facultyId', '==', currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const tasksData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTasks(tasksData);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) return;

    try {
      await addDoc(collection(db, 'facultyTasks'), {
        ...newTask,
        facultyId: currentUser.uid,
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      setModalVisible(false);
      setNewTask({
        title: '',
        description: '',
        deadline: null,
        priority: 'medium',
        status: 'pending'
      });
      fetchTasks();
    } catch (error) {
      console.error('Error adding task:', error);
    }
  };

  const handleUpdateTask = async (taskId, updatedStatus) => {
    try {
      await updateDoc(doc(db, 'facultyTasks', taskId), {
        status: updatedStatus
      });
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

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(Platform.OS === 'ios'); // Keep open on iOS, close on Android
    if (selectedDate) {
      setSelectedDate(selectedDate);
      setNewTask({
        ...newTask,
        deadline: formatDate(selectedDate)
      });
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const showDatepicker = () => {
    setShowDatePicker(true);
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
          <Ionicons name="calendar" size={16} color="#555" /> {item.deadline}
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Faculty Tasks</Text>
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
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="document-text" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No tasks assigned yet</Text>
          </View>
        }
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
                onPress={showDatepicker}
              >
                <Text style={newTask.deadline ? {} : {color: '#999'}}>
                  {newTask.deadline || 'Select deadline date'}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                />
              )}

              <Text style={styles.inputLabel}>Priority</Text>
              <View style={styles.priorityOptions}>
                <TouchableOpacity
                  style={[
                    styles.priorityButton,
                    newTask.priority === 'high' && styles.highPriorityButton
                  ]}
                  onPress={() => setNewTask({...newTask, priority: 'high'})}
                >
                  <Text>High</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.priorityButton,
                    newTask.priority === 'medium' && styles.mediumPriorityButton
                  ]}
                  onPress={() => setNewTask({...newTask, priority: 'medium'})}
                >
                  <Text>Medium</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.priorityButton,
                    newTask.priority === 'low' && styles.lowPriorityButton
                  ]}
                  onPress={() => setNewTask({...newTask, priority: 'low'})}
                >
                  <Text>Low</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddTask}
              >
                <Text style={styles.submitButtonText}>Add Task</Text>
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
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#3F51B5',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  addButton: {
    backgroundColor: '#FF9800',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskList: {
    padding: 16,
  },
  taskCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  highPriority: {
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  mediumPriority: {
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
  },
  lowPriority: {
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 12,
  },
  taskDescription: {
    color: '#555',
    marginBottom: 12,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskDeadline: {
    color: '#555',
    fontSize: 14,
  },
  taskStatus: {
    color: '#F44336',
    fontWeight: 'bold',
    textTransform: 'capitalize',
  },
  completedStatus: {
    color: '#4CAF50',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    color: '#888',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 16,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  inputLabel: {
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#555',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    padding: 12,
    marginBottom: 16,
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  priorityOptions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  priorityButton: {
    flex: 1,
    padding: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    alignItems: 'center',
  },
  highPriorityButton: {
    backgroundColor: '#FFEBEE',
    borderColor: '#F44336',
  },
  mediumPriorityButton: {
    backgroundColor: '#FFF8E1',
    borderColor: '#FFC107',
  },
  lowPriorityButton: {
    backgroundColor: '#E8F5E9',
    borderColor: '#4CAF50',
  },
  cancelButton: {
    padding: 12,
    marginRight: 8,
  },
  cancelButtonText: {
    color: '#555',
  },
  submitButton: {
    backgroundColor: '#3F51B5',
    padding: 12,
    borderRadius: 4,
  },
  submitButtonText: {
    color: 'white',
  },
});

export default FacultyTasksScreen;