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
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { launchImageLibrary } from 'react-native-image-picker';
import { getAuth } from '../../services/Firebase/firebaseConfig';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/Firebase/firebaseConfig';
import { uploadToCloudinary } from '../../services/cloudinaryService';

const AdminNoticesScreen = ({ onNoticeAdded }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
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

    setConfirmModalVisible(true);
  };

  const proceedWithNotice = async () => {
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

      setConfirmModalVisible(false);
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

  const ConfirmationModal = () => (
    <Modal
      animationType="fade"
      transparent={true}
      visible={confirmModalVisible}
      onRequestClose={() => setConfirmModalVisible(false)}
    >
      <View style={styles.confirmModalContainer}>
        <View style={styles.confirmModalContent}>
          <Text style={styles.confirmModalTitle}>Confirm Notice</Text>
          <Text style={styles.confirmModalText}>
            Are you sure you want to post this notice?
          </Text>
          <View style={styles.confirmModalButtons}>
            <TouchableOpacity
              style={[styles.confirmModalButton, styles.cancelButton]}
              onPress={() => setConfirmModalVisible(false)}
            >
              <Text style={styles.confirmModalButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmModalButton, styles.confirmButton]}
              onPress={proceedWithNotice}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.confirmModalButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <>
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Notice</Text>
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setModalVisible(false)}
              >
                <Icon name="times" size={20} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Title</Text>
                <Text style={styles.requiredText}>*</Text>
              </View>
              <TextInput
                style={styles.input}
                value={newNotice.title}
                onChangeText={(text) => setNewNotice({ ...newNotice, title: text })}
                placeholder="Enter notice title"
                placeholderTextColor="#94a3b8"
              />

              <View style={styles.labelRow}>
                <Text style={styles.inputLabel}>Description</Text>
                <Text style={styles.requiredText}>*</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newNotice.description}
                onChangeText={(text) => setNewNotice({ ...newNotice, description: text })}
                placeholder="Enter notice description"
                placeholderTextColor="#94a3b8"
                multiline
                numberOfLines={4}
              />

              <Text style={styles.inputLabel}>Department</Text>
              <TextInput
                style={styles.input}
                value={newNotice.department}
                onChangeText={(text) => setNewNotice({ ...newNotice, department: text })}
                placeholder="Enter department name"
                placeholderTextColor="#94a3b8"
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
                <Icon name="image" size={24} color="#1D3557" />
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
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
              />

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddNotice}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitButtonText}>Post Notice</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmationModal />

      <Pressable
        style={({ pressed }) => [
          styles.addButton,
          pressed && { 
            transform: [{ scale: 0.95 }],
            backgroundColor: '#2A4A74'
          }
        ]}
        onPress={() => setModalVisible(true)}
        android_ripple={{ color: '#2A4A74', radius: 28 }}
      >
        <Icon name="plus" size={24} color="#fff" style={styles.addButtonIcon} />
      </Pressable>
    </>
  );
};

const styles = StyleSheet.create({
  addButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    backgroundColor: '#1D3557',
    width: 60,
    height: 60,
    borderRadius: 30,
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
  addButtonIcon: {
    color: '#fff',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: '94%',
    maxHeight: '85%',
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
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: '#1D3557',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#457B9D',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#F1F5F9',
    color: '#1D3557',
  },
  textArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  audienceSelector: {
    flexDirection: 'row',
    marginBottom: 24,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#457B9D',
  },
  audienceOption: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
  },
  selectedAudience: {
    backgroundColor: '#457B9D',
  },
  audienceOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  selectedAudienceText: {
    color: '#fff',
  },
  imagePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#457B9D',
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: '#F1F5F9',
  },
  imagePickerText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#1D3557',
    fontWeight: '500',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 24,
  },
  submitButton: {
    backgroundColor: '#457B9D',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
    elevation: 2,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 8,
    borderRadius: 8,
  },
  requiredText: {
    color: '#E63946',
    marginLeft: 4,
    fontWeight: '500',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confirmModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  confirmModalText: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmModalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmModalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  confirmButton: {
    backgroundColor: '#1D3557',
  },
  confirmModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default AdminNoticesScreen; 