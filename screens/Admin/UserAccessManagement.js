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
import { useRoute } from '@react-navigation/native';

const UserAccessManagement = () => {
  const route = useRoute();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUserAccess, setCurrentUserAccess] = useState(route.params?.userAccess || 'Basic Admin');

  // Define access levels based on admin type
  const accessLevelHierarchy = {
    'Super Admin': {
      admin: ['Super Admin', 'Department Admin', 'Basic Admin'],
      staff: ['Head of Department', 'Senior Staff', 'Junior Staff'],
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    },
    'Department Admin': {
      staff: ['Head of Department', 'Senior Staff', 'Junior Staff'],
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    },
    'Basic Admin': {
      student: ['Class Representative', 'Student Council', 'Regular Student'],
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      console.log('Starting to fetch users...');
      console.log('Current user access level:', currentUserAccess);
      
      const usersCollection = collection(db, 'users');
      let usersQuery;

      // For Department Admin, only fetch staff and students
      if (currentUserAccess === 'Department Admin') {
        usersQuery = query(
          usersCollection,
          where('role', 'in', ['staff', 'student'])
        );
      } else {
        usersQuery = collection(db, 'users');
      }

      const usersSnapshot = await getDocs(usersQuery);
      console.log('Total users found:', usersSnapshot.size);
      
      const usersList = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log('Processing user document:', doc.id, data);
        return {
          id: doc.id,
          uniqueId: doc.id + '_' + (data.email || Math.random().toString(36).substr(2, 9)),
          ...data,
        };
      });

      // Filter users based on admin level
      const filteredUsers = usersList.filter(user => {
        switch(currentUserAccess) {
          case 'Super Admin':
            return true; // Can see all users
          case 'Department Admin':
            // Can only see staff and students
            return user.role === 'staff' || user.role === 'student';
          case 'Basic Admin':
            return user.role === 'student'; // Can only see students
          default:
            return false;
        }
      });

      console.log('Filtered users to display:', filteredUsers);
      setUsers(filteredUsers);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to load users');
      setLoading(false);
    }
  };

  const getAvailableAccessLevels = (userRole) => {
    const adminType = currentUserAccess;
    const hierarchy = accessLevelHierarchy[adminType];
    
    if (!hierarchy) return [];
    
    // If the user is an admin, check admin hierarchy
    if (userRole === 'admin') {
      return adminType === 'Super Admin' ? hierarchy.admin : [];
    }
    
    // Return appropriate levels based on user role and admin type
    return hierarchy[userRole] || [];
  };

  const updateUserAccess = async (userId, newAccessLevel, userEmail) => {
    try {
      console.log('Attempting to update access level for user:', userId);
      console.log('Using email as document ID:', userEmail);
      console.log('New access level:', newAccessLevel);
      
      const documentId = userEmail || userId;
      const userRef = doc(db, 'users', documentId);
      
      // First verify the user exists
      const userDoc = await getDoc(userRef);
      if (!userDoc.exists()) {
        console.log('User document not found:', documentId);
        Alert.alert('Error', 'User not found. Please ensure the user has registered and try again.');
        return;
      }

      // Get user data
      const userData = userDoc.data();

      // Additional checks for Department Admin
      if (currentUserAccess === 'Department Admin') {
        // Ensure they can only modify staff and student access levels
        if (userData.role === 'admin') {
          Alert.alert('Error', 'Department Admins cannot modify admin access levels');
          return;
        }

        // Verify the new access level is allowed for the user's role
        const availableLevels = getAvailableAccessLevels(userData.role);
        if (!availableLevels.includes(newAccessLevel)) {
          Alert.alert('Error', 'You do not have permission to set this access level');
          return;
        }
      }

      // Update access level for existing user
      try {
        await updateDoc(userRef, {
          accessLevel: newAccessLevel,
          lastUpdated: serverTimestamp()
        });
        console.log('Successfully updated access level for user:', documentId);
        Alert.alert('Success', 'User access level updated successfully');
        fetchUsers(); // Refresh the list
      } catch (error) {
        console.error('Error updating user access:', error);
        Alert.alert('Error', 'Failed to update user access level');
      }
    } catch (error) {
      console.error('Error in updateUserAccess:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    }
  };

  const UserCard = ({ user }) => {
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
                Access Level: {user.accessLevel || 'Not Set'}
              </Text>
            </View>
            {availableAccessLevels.length > 0 && (
              <TouchableOpacity
                style={styles.accessButton}
                onPress={() => setShowAccessLevels(!showAccessLevels)}
              >
                <Icon name="user-shield" size={20} color="#1D3557" />
              </TouchableOpacity>
            )}
          </View>

          {showAccessLevels && availableAccessLevels.length > 0 && (
            <View style={styles.accessLevelsContainer}>
              <Text style={styles.accessLevelTitle}>Access Levels:</Text>
              {availableAccessLevels.map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.accessLevelItem,
                    user.accessLevel === level && styles.selectedLevel,
                  ]}
                  onPress={() => updateUserAccess(user.id, level, user.email)}
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
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Access Management</Text>
      <Text style={styles.subtitle}>Your Access Level: {currentUserAccess}</Text>
      <FlatList
        data={users}
        renderItem={({ item }) => <UserCard user={item} />}
        keyExtractor={(item) => item.uniqueId || item.id + '_' + Date.now()}
        contentContainerStyle={styles.listContainer}
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

export default UserAccessManagement; 