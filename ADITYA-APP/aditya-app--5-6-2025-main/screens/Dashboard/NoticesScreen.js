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
  Image,
  Alert,
  ActivityIndicator,
  Share,
  RefreshControl,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import * as ImagePicker from 'expo-image-picker';
import { getAuth, db } from '../../services/Firebase/firebaseConfig';
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { uploadToCloudinary } from '../../services/cloudinaryService';

const NoticesScreen = () => {
  const [notices, setNotices] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [newNotice, setNewNotice] = useState({
    title: '',
    description: '',
    imageUrl: '',
    targetAudience: 'all', // all, staff, students
    department: '',
    emailCopy: '',
  });

  const auth = getAuth();
  const currentUser = auth.currentUser;
  const [userRole, setUserRole] = useState('student');

  useEffect(() => {
    // Fetch user role from Firestore
    const fetchUserRole = async () => {
      try {
        const userDoc = await db
          .collection('users')
          .doc(currentUser?.email?.toLowerCase())
          .get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          setUserRole(userData.role || userData.accessLevel || 'student');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
      }
    };

    if (currentUser?.email) {
      fetchUserRole();
    }
  }, [currentUser]);

  useEffect(() => {
    // Subscribe to notices collection
    const q = query(
      collection(db, 'notices'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticesList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filter notices based on user role and target audience
        if (
          data.targetAudience === 'all' ||
          (data.targetAudience === 'staff' && (userRole === 'staff' || userRole === 'admin')) ||
          (data.targetAudience === 'students' && userRole === 'student') ||
          userRole === 'admin'
        ) {
          noticesList.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          });
        }
      });
      setNotices(noticesList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userRole]);

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const handleAddNotice = async () => {
    if (!newNotice.title.trim()) {
      Alert.alert('Error', 'Please enter a notice title');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = '';
      if (selectedImage) {
        // Upload to Cloudinary
        imageUrl = await uploadToCloudinary(selectedImage);
      }

      // Add notice to Firestore
      await addDoc(collection(db, 'notices'), {
        ...newNotice,
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: {
          email: currentUser?.email,
          name: currentUser?.displayName,
        },
      });

      // Send email if email copy is provided
      if (newNotice.emailCopy) {
        // Implement email sending functionality here
        // You can use a cloud function or a backend service
      }

      setModalVisible(false);
      setNewNotice({
        title: '',
        description: '',
        imageUrl: '',
        targetAudience: 'all',
        department: '',
        emailCopy: '',
      });
      setSelectedImage(null);
    } catch (error) {
      console.error('Error adding notice:', error);
      Alert.alert('Error', 'Failed to add notice');
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async (notice) => {
    try {
      await Share.share({
        message: `${notice.title}\n\n${notice.description}${notice.imageUrl ? '\n\nImage: ' + notice.imageUrl : ''}`,
        title: notice.title,
      });
    } catch (error) {
      console.error('Error sharing notice:', error);
      Alert.alert('Error', 'Failed to share notice');
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // The onSnapshot listener will automatically update the notices
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const renderNotice = ({ item }) => (
    <Card style={styles.noticeCard}>
      <Card.Content>
        <View style={styles.noticeHeader}>
          <View>
            <Text style={styles.noticeTitle}>{item.title}</Text>
            <Text style={styles.noticeMetadata}>
              {item.department} • {item.createdAt.toLocaleDateString()}
            </Text>
          </View>
          {(userRole === 'staff' || userRole === 'student') && (
            <TouchableOpacity onPress={() => handleShare(item)}>
              <Icon name="share-alt" size={20} color="#1D3557" />
            </TouchableOpacity>
          )}
        </View>
        
        {item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.noticeImage}
            resizeMode="cover"
          />
        )}
        
        <Text style={styles.noticeDescription}>{item.description}</Text>
        
        <View style={styles.noticeFooter}>
          <Text style={styles.noticeAuthor}>
            Posted by: {item.createdBy?.name || 'Admin'}
          </Text>
          <Text style={[
            styles.audienceBadge,
            item.targetAudience === 'staff' && styles.staffBadge,
            item.targetAudience === 'students' && styles.studentsBadge,
          ]}>
            {item.targetAudience.charAt(0).toUpperCase() + item.targetAudience.slice(1)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notices</Text>
        {userRole === 'admin' && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Icon name="plus" size={20} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1D3557" />
        </View>
      ) : (
        <FlatList
          data={notices}
          renderItem={renderNotice}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.noticesList}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#1D3557']}
              tintColor="#1D3557"
            />
          }
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Icon name="bell-slash" size={48} color="#ccc" />
              <Text style={styles.emptyStateText}>No notices available</Text>
            </View>
          )}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Notice</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Icon name="times" size={20} color="#1D3557" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title*</Text>
              <TextInput
                style={styles.input}
                value={newNotice.title}
                onChangeText={(text) => setNewNotice({ ...newNotice, title: text })}
                placeholder="Enter notice title"
              />

              <Text style={styles.inputLabel}>Description*</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newNotice.description}
                onChangeText={(text) => setNewNotice({ ...newNotice, description: text })}
                placeholder="Enter notice description"
                multiline
                numberOfLines={4}
              />

              <Text style={styles.inputLabel}>Department</Text>
              <TextInput
                style={styles.input}
                value={newNotice.department}
                onChangeText={(text) => setNewNotice({ ...newNotice, department: text })}
                placeholder="Enter department name"
              />

              <Text style={styles.inputLabel}>Target Audience</Text>
              <View style={styles.audienceSelector}>
                {['all', 'staff', 'students'].map((audience) => (
                  <TouchableOpacity
                    key={audience}
                    style={[
                      styles.audienceOption,
                      newNotice.targetAudience === audience && styles.selectedAudience,
                    ]}
                    onPress={() => setNewNotice({ ...newNotice, targetAudience: audience })}
                  >
                    <Text style={[
                      styles.audienceOptionText,
                      newNotice.targetAudience === audience && styles.selectedAudienceText,
                    ]}>
                      {audience.charAt(0).toUpperCase() + audience.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Image</Text>
              <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
                <Icon name="image" size={20} color="#1D3557" />
                <Text style={styles.imagePickerText}>
                  {selectedImage ? 'Change Image' : 'Add Image'}
                </Text>
              </TouchableOpacity>
              {selectedImage && (
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              )}

              <Text style={styles.inputLabel}>Send Email Copy To</Text>
              <TextInput
                style={styles.input}
                value={newNotice.emailCopy}
                onChangeText={(text) => setNewNotice({ ...newNotice, emailCopy: text })}
                placeholder="Enter email addresses (comma-separated)"
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddNotice}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Post Notice</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1D3557',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  addButton: {
    backgroundColor: '#457B9D',
    padding: 10,
    borderRadius: 8,
  },
  noticesList: {
    padding: 16,
  },
  noticeCard: {
    marginBottom: 16,
    borderRadius: 8,
    elevation: 2,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 4,
  },
  noticeMetadata: {
    fontSize: 12,
    color: '#6c757d',
  },
  noticeImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
  noticeDescription: {
    fontSize: 14,
    color: '#212529',
    marginVertical: 8,
  },
  noticeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  noticeAuthor: {
    fontSize: 12,
    color: '#6c757d',
  },
  audienceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#E9ECEF',
    fontSize: 12,
  },
  staffBadge: {
    backgroundColor: '#457B9D',
    color: '#fff',
  },
  studentsBadge: {
    backgroundColor: '#2EC4B6',
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6c757d',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 8,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#dee2e6',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    padding: 8,
    marginBottom: 16,
    fontSize: 14,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  audienceSelector: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  audienceOption: {
    flex: 1,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ced4da',
    marginRight: 8,
    borderRadius: 4,
  },
  selectedAudience: {
    backgroundColor: '#1D3557',
    borderColor: '#1D3557',
  },
  audienceOptionText: {
    color: '#1D3557',
  },
  selectedAudienceText: {
    color: '#fff',
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#ced4da',
    borderRadius: 4,
    marginBottom: 16,
  },
  imagePickerText: {
    marginLeft: 8,
    color: '#1D3557',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 4,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#1D3557',
    padding: 12,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default NoticesScreen; 