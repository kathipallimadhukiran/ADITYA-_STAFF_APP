import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { launchImageLibrary } from 'react-native-image-picker';
import { getAuth } from '../../services/Firebase/firebaseConfig';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/Firebase/firebaseConfig';
import { uploadToCloudinary } from '../../services/cloudinaryService';

const AdminNoticesScreen = ({ onNoticeAdded }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [newNotice, setNewNotice] = useState({
    title: '',
    description: '',
    imageUrl: '',
    targetAudience: 'all',
    department: '',
    emailCopy: '',
  });

  const auth = getAuth();
  const currentUser = auth.currentUser;

  const pickImage = async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 1,
        includeBase64: false,
      });

      if (!result.didCancel && result.assets && result.assets[0]) {
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
        imageUrl = await uploadToCloudinary(selectedImage);
      }

      const noticeData = {
        ...newNotice,
        imageUrl,
        createdAt: serverTimestamp(),
        createdBy: {
          email: currentUser?.email,
          name: currentUser?.displayName,
          role: 'admin'
        },
      };

      await addDoc(collection(db, 'notices'), noticeData);

      if (newNotice.emailCopy) {
        // TODO: Implement email notification functionality
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
      
      if (onNoticeAdded) {
        onNoticeAdded();
      }
    } catch (error) {
      console.error('Error adding notice:', error);
      Alert.alert('Error', 'Failed to add notice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Icon name="plus" size={20} color="#fff" />
        <Text style={styles.addButtonText}>Add New Notice</Text>
      </TouchableOpacity>

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
    padding: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#457B9D',
    padding: 12,
    borderRadius: 8,
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontSize: 16,
    fontWeight: 'bold',
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

export default AdminNoticesScreen; 