// DigitalIDCard.jsx

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

const DigitalIDCard = ({ route }) => {
  const [imageLoading, setImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const userData = route.params?.userData;

  const getCurrentAcademicYear = () => {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return month < 6 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
  };

  if (!userData) {
    return (
      <View style={styles.errorContainer}>
        <Icon name="exclamation-circle" size={50} color="#DC2626" />
        <Text style={styles.errorText}>Could not load user data</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Card style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/college-logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.collegeName}>ADITYA EDUCATIONAL INSTITUTIONS</Text>
            <Text style={styles.cardTitle}>IDENTITY CARD</Text>
            {userData.role?.toLowerCase() === 'student' && (
              <Text style={styles.academicYear}>{getCurrentAcademicYear()}</Text>
            )}
          </View>

          {/* Photo Section */}
          <View style={styles.photoSection}>
            {userData.profilePhoto ? (
              <>
                <Image
                  source={{ uri: userData.profilePhoto }}
                  style={styles.studentPhoto}
                  onLoadStart={() => setImageLoading(true)}
                  onLoadEnd={() => setImageLoading(false)}
                  onError={() => {
                    setImageError(true);
                    setImageLoading(false);
                  }}
                />
                {imageLoading && (
                  <View style={styles.imageLoadingContainer}>
                    <ActivityIndicator size="small" color="#1D3557" />
                  </View>
                )}
                {imageError && (
                  <View style={styles.photoPlaceholder}>
                    <Icon name="exclamation-circle" size={30} color="#DC2626" />
                    <Text style={styles.placeholderText}>Image Error</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.photoPlaceholder}>
                <Icon name="user" size={40} color="#666" />
                <Text style={styles.placeholderText}>No Photo</Text>
              </View>
            )}
          </View>

          {/* Details */}
          <View style={styles.detailsSection}>
            {[
              { label: 'Name', value: userData.name },
              { label: 'ID', value: userData.id },
              { label: 'Email', value: userData.email },
              { label: 'Role', value: userData.role?.charAt(0).toUpperCase() + userData.role?.slice(1) },
              { label: 'Phone', value: userData.phoneNumber },
              {
                label: 'Created',
                value: userData.createdAt
                  ? new Date(userData.createdAt).toLocaleDateString()
                  : null,
              },
            ].map((item, idx) => (
              <View key={idx} style={styles.detailRow}>
                <Text style={styles.label}>{item.label}:</Text>
                <Text style={styles.value}>{item.value || 'Not Available'}</Text>
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            {userData.role?.toLowerCase() === 'student' && (
              <Text style={styles.validityText}>
                Valid till: {getCurrentAcademicYear().split('-')[1]}
              </Text>
            )}
            {userData.qrCode && typeof userData.qrCode === 'string' && (
              <Image 
                source={{ uri: userData.qrCode }} 
                style={styles.qrCode}
                onError={(error) => console.warn('QR Code image error:', error)}
              />
            )}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f5',
  },
  scrollContainer: {
    padding: 20,
  },
  card: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    elevation: 5,
  },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    paddingBottom: 15,
    marginBottom: 20,
  },
  logo: {
    width: 70,
    height: 70,
    marginBottom: 10,
  },
  collegeName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1D3557',
    textAlign: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#457b9d',
    marginTop: 4,
  },
  academicYear: {
    fontSize: 13,
    color: '#6c757d',
    marginTop: 2,
  },
  photoSection: {
    alignItems: 'center',
    marginBottom: 25,
  },
  studentPhoto: {
    width: 120,
    height: 150,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#f5f5f5',
  },
  photoPlaceholder: {
    width: 120,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  placeholderText: {
    marginTop: 6,
    fontSize: 12,
    color: '#888',
  },
  imageLoadingContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    width: 120,
    height: 150,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 10,
  },
  detailsSection: {
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 14,
    color: '#444',
    fontWeight: '600',
    flex: 1,
  },
  value: {
    fontSize: 14,
    color: '#1D3557',
    flex: 2,
    textAlign: 'right',
  },
  footer: {
    alignItems: 'center',
    marginTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
  },
  validityText: {
    fontSize: 12,
    color: '#888',
  },
  qrCode: {
    width: 90,
    height: 90,
    marginTop: 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    marginTop: 10,
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default DigitalIDCard;
