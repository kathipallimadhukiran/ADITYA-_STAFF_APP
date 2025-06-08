import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { db } from '../../services/Firebase/firebaseConfig';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const StaffLocationTracker = () => {
  const [staffLocations, setStaffLocations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStaffLocations();
  }, []);

  const fetchStaffLocations = async () => {
    try {
      // Get all staff members
      const staffQuery = query(
        collection(db, 'users'),
        where('role', '==', 'staff')
      );
      const staffSnapshot = await getDocs(staffQuery);
      
      // Get latest locations
      const locationQuery = query(
        collection(db, 'locations'),
        where('userRole', '==', 'staff'),
        orderBy('timestamp', 'desc')
      );
      const locationSnapshot = await getDocs(locationQuery);
      
      const locationMap = {};
      locationSnapshot.forEach(doc => {
        const data = doc.data();
        if (!locationMap[data.userId]) {
          locationMap[data.userId] = data;
        }
      });

      const staffData = [];
      staffSnapshot.forEach(doc => {
        const staff = doc.data();
        const location = locationMap[doc.id] || {
          status: 'Unknown',
          lastSeen: null,
          location: 'Not Available'
        };

        staffData.push({
          id: doc.id,
          name: staff.name,
          department: staff.department,
          status: location.status,
          lastSeen: location.timestamp ? new Date(location.timestamp.toDate()) : null,
          location: location.location
        });
      });

      setStaffLocations(staffData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching staff locations:', error);
      Alert.alert('Error', 'Failed to load staff locations');
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return '#2EC4B6';
      case 'away':
        return '#FF9F1C';
      case 'offline':
        return '#F94144';
      default:
        return '#6C757D';
    }
  };

  const formatLastSeen = (date) => {
    if (!date) return 'Never';
    
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const StaffCard = ({ staff }) => (
    <Card style={styles.staffCard}>
      <Card.Content>
        <View style={styles.staffHeader}>
          <View>
            <Text style={styles.staffName}>{staff.name}</Text>
            <Text style={styles.staffDepartment}>{staff.department}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(staff.status) }]}>
            <Text style={styles.statusText}>{staff.status || 'Unknown'}</Text>
          </View>
        </View>
        
        <View style={styles.locationInfo}>
          <View style={styles.infoRow}>
            <Icon name="map-marker-alt" size={14} color="#666" />
            <Text style={styles.locationText}>
              {staff.location || 'Location not available'}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Icon name="clock" size={14} color="#666" />
            <Text style={styles.timeText}>
              Last seen: {formatLastSeen(staff.lastSeen)}
            </Text>
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Staff Location Tracker</Text>
      <FlatList
        data={staffLocations}
        renderItem={({ item }) => <StaffCard staff={item} />}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshing={loading}
        onRefresh={fetchStaffLocations}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  staffCard: {
    marginBottom: 12,
    elevation: 2,
    borderRadius: 8,
  },
  staffHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  staffName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  staffDepartment: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  locationInfo: {
    marginTop: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  locationText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
  timeText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#666',
  },
});

export default StaffLocationTracker; 