import React, { useState, useEffect, useCallback } from 'react';
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
import { 
  collection, 
  query, 
  getDocs, 
  updateDoc, 
  doc, 
  getDoc,
  serverTimestamp,
  where 
} from 'firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';

// Define access levels hierarchy outside component for better performance
const ACCESS_LEVEL_HIERARCHY = {
  'Super Admin': {
    canView: ['admin', 'staff', 'student'],
    canModify: {
      admin: ['Super Admin', 'Department Admin', 'Basic Admin'],
      staff: ['Head of Department', 'Senior Staff', 'Junior Staff'],
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    }
  },
  'Department Admin': {
    canView: ['staff', 'student'],
    canModify: {
      staff: ['Head of Department', 'Senior Staff', 'Junior Staff'],
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    }
  },
  'Basic Admin': {
    canView: ['student'],
    canModify: {
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    }
  }
};

export default function UserAccessManagement() {
  const navigation = useNavigation();
  const route = useRoute();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const currentUserAccess = route.params?.userAccess || 'Basic Admin';

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Get the viewable roles for current admin level
      const viewableRoles = ACCESS_LEVEL_HIERARCHY[currentUserAccess]?.canView || [];
      
      if (viewableRoles.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      // Create query based on viewable roles
      const usersQuery = query(
        collection(db, 'users'),
        where('role', 'in', viewableRoles)
      );

      const usersSnapshot = await getDocs(usersQuery);
      const usersList = usersSnapshot.docs.map(doc => ({
        id: doc.id,
        uniqueId: `${doc.id}_${doc.data().email || Math.random().toString(36).substr(2, 9)}`,
        ...doc.data()
      }));

      setUsers(usersList);
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Failed to load users. Please try again.');
      Alert.alert('Error', 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [currentUserAccess]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getAvailableAccessLevels = (userRole) => {
    return ACCESS_LEVEL_HIERARCHY[currentUserAccess]?.canModify[userRole] || [];
  };

  const updateUserAccess = async (userId, newAccessLevel, userEmail) => {
    try {
      setLoading(true);
      
      const documentId = userEmail || userId;
      const userRef = doc(db, 'users', documentId);
      
      // Verify user exists and get current data
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        throw new Error('User not found');
      }

      const userData = userDoc.data();
      const availableLevels = getAvailableAccessLevels(userData.role);

      // Validate the new access level is allowed
      if (!availableLevels.includes(newAccessLevel)) {
        throw new Error('You do not have permission to set this access level');
      }

      // Update the user's access level
      await updateDoc(userRef, {
        accessLevel: newAccessLevel,
        lastUpdated: serverTimestamp()
      });

      // Refresh the user list
      await fetchUsers();
      
      Alert.alert('Success', 'User access level updated successfully');
    } catch (error) {
      console.error('Error updating user access:', error);
      Alert.alert('Error', error.message || 'Failed to update user access level');
    } finally {
      setLoading(false);
    }
  };

  const UserCard = React.memo(({ user }) => {
    const [showAccessLevels, setShowAccessLevels] = useState(false);
    const availableAccessLevels = getAvailableAccessLevels(user.role);

    return (
      <Card style={styles.userCard}>
        <Card.Content>
          <View style={styles.userHeader}>
            <View>
              <Text style={styles.userName}>{user.name || 'No Name'}</Text>
              <Text style={styles.userEmail}>{user.email || user.id}</Text>
              <Text style={styles.userRole}>{user.role || 'No Role'}</Text>
              <Text style={styles.accessLevel}>
                Current Access: {user.accessLevel || 'Not Set'}
              </Text>
            </View>
            
            {availableAccessLevels.length > 0 && (
              <TouchableOpacity
                style={styles.accessButton}
                onPress={() => setShowAccessLevels(!showAccessLevels)}
                disabled={loading}
              >
                <Icon 
                  name="user-shield" 
                  size={20} 
                  color={loading ? '#ccc' : '#1D3557'} 
                />
              </TouchableOpacity>
            )}
          </View>

          {showAccessLevels && availableAccessLevels.length > 0 && (
            <View style={styles.accessLevelsContainer}>
              <Text style={styles.accessLevelTitle}>Set Access Level:</Text>
              {availableAccessLevels.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.accessLevelItem,
                    user.accessLevel === level && styles.selectedLevel,
                  ]}
                  onPress={() => updateUserAccess(user.id, level, user.email)}
                  disabled={loading}
                >
                  <Text style={[
                    styles.accessLevelText,
                    user.accessLevel === level && styles.selectedLevelText,
                  ]}>
                    {level}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  });

  if (loading && users.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity 
          style={styles.retryButton}
          onPress={fetchUsers}
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Access Management</Text>
      <Text style={styles.subtitle}>
        Your Access Level: {currentUserAccess}
        {loading && ' (Updating...)'}
      </Text>
      
      <FlatList
        data={users}
        renderItem={({ item }) => <UserCard user={item} />}
        keyExtractor={(item) => item.uniqueId}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No users found for your access level</Text>
        }
        refreshing={loading}
        onRefresh={fetchUsers}
      />
    </View>
  );
}

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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#457B9D',
    marginBottom: 16,
    fontStyle: 'italic',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#F94144',
    marginBottom: 20,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#1D3557',
    padding: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6c757d',
    marginTop: 20,
    fontSize: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  userCard: {
    marginBottom: 12,
    elevation: 2,
    borderRadius: 8,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  userRole: {
    fontSize: 14,
    color: '#2EC4B6',
    fontWeight: '500',
    marginTop: 4,
  },
  accessLevel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  accessButton: {
    padding: 8,
    backgroundColor: '#E9ECEF',
    borderRadius: 20,
  },
  accessLevelsContainer: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
  },
  accessLevelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 8,
  },
  accessLevelItem: {
    padding: 8,
    marginVertical: 4,
    borderRadius: 4,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#DEE2E6',
  },
  selectedLevel: {
    backgroundColor: '#1D3557',
    borderColor: '#1D3557',
  },
  accessLevelText: {
    fontSize: 14,
    color: '#1D3557',
  },
  selectedLevelText: {
    color: '#fff',
  },
});