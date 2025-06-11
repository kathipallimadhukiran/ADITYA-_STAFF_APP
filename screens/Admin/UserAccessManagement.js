import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  Dimensions,
  SectionList,
  Modal as RNModal,
} from 'react-native';
import { Card, List, Divider, Searchbar, Menu, Button, Surface, TextInput, Portal, Modal, IconButton } from 'react-native-paper';
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
  where,
  orderBy
} from 'firebase/firestore';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useUser } from '../../context/UserContext';
import { ScrollView } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

const ROLE_DESIGNATIONS = {
  admin: [
    { 
      id: 'super_admin', 
      label: 'Super Admin',
      icon: 'user-shield',
      color: '#FF9F1C',
      description: 'Full system access with all administrative privileges'
    },
    { 
      id: 'department_admin', 
      label: 'Department Admin',
      icon: 'user-cog',
      color: '#2EC4B6',
      description: 'Administrative access limited to department'
    },
    { 
      id: 'basic_admin', 
      label: 'Basic Admin',
      icon: 'shield-alt',
      color: '#457B9D',
      description: 'Basic administrative privileges'
    }
  ],
  faculty: [
    { 
      id: 'hod', 
      label: 'Head of Department',
      icon: 'user-tie',
      color: '#FF9F1C',
      description: 'Department head with full faculty privileges'
    },
    { 
      id: 'associate_professor', 
      label: 'Associate Professor',
      icon: 'chalkboard-teacher',
      color: '#2EC4B6',
      description: 'Senior faculty member'
    },
    { 
      id: 'professor', 
      label: 'Professor',
      icon: 'user-graduate',
      color: '#457B9D',
      description: 'Faculty member'
    },
    { 
      id: 'lab_incharge', 
      label: 'Lab In-charge',
      icon: 'flask',
      color: '#E63946',
      description: 'Laboratory management responsibilities'
    }
  ],
  staff: [
    { 
      id: 'senior_staff', 
      label: 'Senior Staff',
      icon: 'user-tie',
      color: '#FF9F1C',
      description: 'Senior staff member with extended privileges'
    },
    { 
      id: 'operator', 
      label: 'Operator',
      icon: 'user-cog',
      color: '#2EC4B6',
      description: 'Staff operator with specific duties'
    },
    { 
      id: 'basic_staff', 
      label: 'Basic Staff',
      icon: 'user',
      color: '#457B9D',
      description: 'Regular staff member'
    }
  ],
  student: [
    { 
      id: 'student_council', 
      label: 'Student Council',
      icon: 'user-check',
      color: '#FF9F1C',
      description: 'Student council member with leadership responsibilities'
    },
    { 
      id: 'class_representative', 
      label: 'Class Representative',
      icon: 'user-friends',
      color: '#2EC4B6',
      description: 'Class representative with specific duties'
    },
    { 
      id: 'student', 
      label: 'Student',
      icon: 'user-graduate',
      color: '#457B9D',
      description: 'Regular student'
    }
  ]
};

const ACCESS_LEVELS = [
  {
    id: 'super_admin',
    label: 'Super Admin',
    icon: 'user-shield',
    color: '#FF9F1C',
    description: 'Full system access with all administrative privileges',
    level: 3
  },
  {
    id: 'admin',
    label: 'Administrator',
    icon: 'user-cog',
    color: '#2EC4B6',
    description: 'Department-level administrative access',
    level: 2
  },
  {
    id: 'basic',
    label: 'Basic Access',
    icon: 'user',
    color: '#457B9D',
    description: 'Standard user access level',
    level: 1
  }
];

const EditModal = ({ visible, onDismiss, userData, onSave, currentUserAccess }) => {
  const [editedUser, setEditedUser] = useState({
    name: '',
    email: '',
    department: '',
    role: '',
    designation: '',
    accessLevel: ''
  });
  const [showDepartmentMenu, setShowDepartmentMenu] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showDesignationMenu, setShowDesignationMenu] = useState(false);
  const [showAccessMenu, setShowAccessMenu] = useState(false);

  useEffect(() => {
    if (userData) {
      setEditedUser({
        ...userData,
        role: userData.role || '',
        designation: userData.designation || '',
        department: userData.department || '',
        accessLevel: userData.accessLevel || 'Basic'
      });
    }
  }, [userData]);

  const roles = useMemo(() => ['Admin', 'Faculty', 'Staff', 'Student'], []);
  const departments = useMemo(() => ['CSE', 'ECE', 'EEE', 'MECH', 'CIVIL', 'IT'], []);

  const getDesignationIcon = useCallback((role) => {
    switch (role?.toLowerCase()) {
      case 'admin': return 'user-shield';
      case 'faculty': return 'chalkboard-teacher';
      case 'staff': return 'user-tie';
      case 'student': return 'user-graduate';
      default: return 'user';
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave(editedUser);
    onDismiss();
  }, [editedUser, onSave, onDismiss]);

  const handleRoleChange = useCallback((role) => {
    setEditedUser(prev => ({ 
      ...prev, 
      role: role.toLowerCase(),
      designation: '' 
    }));
    setShowRoleMenu(false);
  }, []);

  const handleDepartmentChange = useCallback((dept) => {
    setEditedUser(prev => ({ ...prev, department: dept }));
    setShowDepartmentMenu(false);
  }, []);

  const handleDesignationChange = useCallback((designationId) => {
    setEditedUser(prev => ({ ...prev, designation: designationId }));
    setShowDesignationMenu(false);
  }, []);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.editModalContainer, styles.modalOverlay]}
      >
        <View style={styles.editModalContent}>
          <View style={styles.modalHeader}>
            <Icon name="user-edit" size={24} color="#1D3557" />
            <Text style={styles.modalTitle}>Edit User</Text>
            <IconButton icon="close" onPress={onDismiss} />
          </View>

          <ScrollView style={styles.editFormContainer}>
            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Basic Information</Text>
              
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Name</Text>
                <TextInput
                  value={editedUser.name}
                  onChangeText={(text) => setEditedUser({ ...editedUser, name: text })}
                  style={styles.textInput}
                  mode="outlined"
                  outlineColor="#E9ECEF"
                  activeOutlineColor="#457B9D"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Email</Text>
                <TextInput
                  value={editedUser.email}
                  style={[styles.textInput, styles.disabledInput]}
                  mode="outlined"
                  disabled={true}
                  outlineColor="#E9ECEF"
                />
              </View>
            </View>

            <View style={styles.formSection}>
              <Text style={styles.sectionTitle}>Role & Department</Text>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Department</Text>
                <TouchableOpacity 
                  onPress={() => setShowDepartmentMenu(true)}
                  style={[styles.dropdownButton, editedUser.department && styles.dropdownButtonSelected]}
                >
                  <Icon name="building" size={20} color="#457B9D" />
                  <Text style={styles.dropdownButtonText}>
                    {editedUser.department || 'Select Department'}
                  </Text>
                  <Icon name="chevron-down" size={16} color="#457B9D" />
                </TouchableOpacity>
                <Menu
                  visible={showDepartmentMenu}
                  onDismiss={() => setShowDepartmentMenu(false)}
                  anchor={<View />}
                  style={styles.menu}
                >
                  {departments.map((dept) => (
                    <Menu.Item
                      key={dept}
                      onPress={() => {
                        handleDepartmentChange(dept);
                      }}
                      title={dept}
                      leadingIcon="building"
                    />
                  ))}
                </Menu>
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Role</Text>
                <TouchableOpacity 
                  onPress={() => setShowRoleMenu(true)}
                  style={[styles.dropdownButton, editedUser.role && styles.dropdownButtonSelected]}
                >
                  <Icon name={getDesignationIcon(editedUser.role)} size={20} color="#457B9D" />
                  <Text style={styles.dropdownButtonText}>
                    {editedUser.role || 'Select Role'}
                  </Text>
                  <Icon name="chevron-down" size={16} color="#457B9D" />
                </TouchableOpacity>
                <Menu
                  visible={showRoleMenu}
                  onDismiss={() => setShowRoleMenu(false)}
                  anchor={<View />}
                  style={styles.menu}
                >
                  {roles.map((role) => (
                    <Menu.Item
                      key={role}
                      onPress={() => {
                        handleRoleChange(role);
                      }}
                      title={role}
                      leadingIcon={getDesignationIcon(role)}
                    />
                  ))}
                </Menu>
              </View>

              {editedUser.role && ROLE_DESIGNATIONS[editedUser.role.toLowerCase()] && (
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Designation</Text>
                  <TouchableOpacity 
                    onPress={() => setShowDesignationMenu(true)}
                    style={[styles.dropdownButton, editedUser.designation && styles.dropdownButtonSelected]}
                  >
                    <Icon name="id-badge" size={20} color="#457B9D" />
                    <Text style={styles.dropdownButtonText}>
                      {ROLE_DESIGNATIONS[editedUser.role.toLowerCase()]?.find(d => d.id === editedUser.designation)?.label || 'Select Designation'}
                    </Text>
                    <Icon name="chevron-down" size={16} color="#457B9D" />
                  </TouchableOpacity>
                  <Menu
                    visible={showDesignationMenu}
                    onDismiss={() => setShowDesignationMenu(false)}
                    anchor={<View />}
                    style={styles.menu}
                  >
                    {ROLE_DESIGNATIONS[editedUser.role.toLowerCase()]?.map((designation) => (
                      <Menu.Item
                        key={designation.id}
                        onPress={() => {
                          handleDesignationChange(designation.id);
                        }}
                        title={designation.label}
                        leadingIcon="id-badge"
                      />
                    ))}
                  </Menu>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Button 
              onPress={onDismiss}
              mode="outlined"
              style={styles.footerButton}
            >
              Cancel
            </Button>
            <Button 
              mode="contained" 
              onPress={handleSave}
              style={[styles.footerButton, styles.saveButton]}
              disabled={!editedUser.name || !editedUser.role || !editedUser.department}
            >
              Save Changes
            </Button>
          </View>
        </View>
      </Modal>
    </Portal>
  );
};

const UserCard = ({ user, icon, onEdit, currentUserAccess }) => {
  const [expanded, setExpanded] = useState(false);

  if (!user) return null;

  const canEdit = currentUserAccess === 'Super Admin' || 
                 (currentUserAccess === 'Admin' && user?.role !== 'admin') ||
                 (currentUserAccess === 'Basic' && user?.role === 'student');

    return (
      <Card style={styles.userCard}>
      <TouchableOpacity onPress={() => setExpanded(!expanded)}>
        <Card.Content>
          <View style={styles.userCardHeader}>
            <Icon name={icon || 'user'} size={20} color="#1D3557" style={styles.userIcon} />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{user?.name || 'Unknown User'}</Text>
              <Text style={styles.userEmail}>{user?.email || 'No email'}</Text>
              <Text style={styles.userRole}>
                {user?.department || 'No Department'} • {user?.accessLevel || user?.role || 'No Role'}
              </Text>
            </View>
            <Icon 
              name={expanded ? 'chevron-up' : 'chevron-down'} 
              size={16} 
              color="#1D3557" 
            />
            </View>
            
          {expanded && (
            <View style={styles.expandedContent}>
              <Divider style={styles.divider} />
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Role</Text>
                  <Text style={styles.detailValue}>{user?.role || 'Not Set'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Access Level</Text>
                  <Text style={styles.detailValue}>{user?.accessLevel || 'Basic'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Department</Text>
                  <Text style={styles.detailValue}>{user?.department || 'Not Assigned'}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.detailLabel}>Last Active</Text>
                  <Text style={styles.detailValue}>
                    {user?.lastActive ? new Date(user.lastActive).toLocaleDateString() : 'Never'}
                  </Text>
                </View>
              </View>
              
              {canEdit && (
                <Button 
                  mode="contained" 
                  onPress={() => onEdit(user)}
                  style={styles.editButton}
                  icon="pencil"
                >
                  Edit Details
                </Button>
              )}
            </View>
          )}
        </Card.Content>
      </TouchableOpacity>
    </Card>
  );
};

const RoleCard = ({ role, onPress, isSelected, count }) => (
              <TouchableOpacity
    onPress={onPress}
    style={[
      styles.roleCard,
      isSelected && styles.roleCardSelected,
      { borderColor: isSelected ? ROLE_COLORS[role.toLowerCase()] : '#E6E6E6' }
    ]}
    activeOpacity={0.7}
  >
    <View 
      style={[
        styles.roleIconContainer, 
        { 
          backgroundColor: ROLE_COLORS[role.toLowerCase()] + (isSelected ? '30' : '15'),
          borderColor: isSelected ? ROLE_COLORS[role.toLowerCase()] : 'transparent',
        }
      ]}
              >
                <Icon 
        name={ROLE_ICONS[role.toLowerCase()] || 'user'} 
        size={28} 
        color={ROLE_COLORS[role.toLowerCase()]}
      />
    </View>
    <Text style={[
      styles.roleTitle,
      isSelected && { color: ROLE_COLORS[role.toLowerCase()] }
    ]}>
      {role}
    </Text>
    <Text style={[
      styles.roleCount,
      isSelected && { color: ROLE_COLORS[role.toLowerCase()] }
    ]}>
      {count} Users
    </Text>
    {isSelected && (
      <View style={[
        styles.selectedIndicator,
        { backgroundColor: ROLE_COLORS[role.toLowerCase()] + '15' }
      ]}>
        <Icon 
          name="check-circle" 
                  size={20} 
          color={ROLE_COLORS[role.toLowerCase()]} 
        />
      </View>
    )}
  </TouchableOpacity>
);

const ROLE_COLORS = {
  admin: '#FF9F1C',
  faculty: '#2EC4B6',
  staff: '#457B9D',
  student: '#E63946'
};

const ROLE_ICONS = {
  admin: 'user-shield',
  faculty: 'chalkboard-teacher',
  staff: 'user-tie',
  student: 'user-graduate'
};

const AccessLevelModal = ({ visible, onDismiss, user, onSave }) => {
  const [selectedLevel, setSelectedLevel] = useState(user?.designation || '');
  const availableLevels = ROLE_DESIGNATIONS[user?.role?.toLowerCase()] || [];

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modalOverlayContainer}
      >
        <View style={styles.accessModalContainer}>
          <View style={styles.accessModalContent}>
            <View style={styles.accessModalHeader}>
              <View style={styles.accessModalHeaderContent}>
                <View style={styles.accessModalIconContainer}>
                  <Icon name="shield-alt" size={24} color="#1D3557" />
                </View>
                <View style={styles.accessModalTitleContainer}>
                  <Text style={styles.accessModalTitle}>Manage Access Level</Text>
                  <Text style={styles.accessModalSubtitle}>
                    {user?.name}
                  </Text>
                </View>
              </View>
              <IconButton 
                icon="close" 
                size={24}
                onPress={onDismiss}
                style={styles.accessModalCloseButton}
              />
          </View>

            <View style={styles.currentRoleContainer}>
              <View style={[
                styles.currentRoleIcon,
                { backgroundColor: ROLE_COLORS[user?.role?.toLowerCase()] + '15' }
              ]}>
                <Icon 
                  name={ROLE_ICONS[user?.role?.toLowerCase()] || 'user'} 
                  size={20} 
                  color={ROLE_COLORS[user?.role?.toLowerCase()]} 
                />
              </View>
              <View style={styles.currentRoleInfo}>
                <Text style={styles.currentRoleLabel}>Current Role</Text>
                <Text style={styles.currentRoleValue}>{user?.role || 'No Role'}</Text>
              </View>
            </View>

            <ScrollView style={styles.accessLevelsScrollView}>
              <View style={styles.accessLevelsList}>
                {availableLevels.map((level) => (
                <TouchableOpacity
                    key={level.id}
                  style={[
                    styles.accessLevelItem,
                      selectedLevel === level.id && styles.accessLevelItemSelected,
                    ]}
                    onPress={() => setSelectedLevel(level.id)}
                  >
                    <View style={[
                      styles.accessLevelIconContainer, 
                      { backgroundColor: level.color + '15' }
                    ]}>
                      <Icon 
                        name={level.icon}
                        size={24}
                        color={level.color}
                      />
                    </View>
                    <View style={styles.accessLevelInfo}>
                  <Text style={[
                        styles.accessLevelTitle,
                        selectedLevel === level.id && styles.accessLevelTitleSelected
                  ]}>
                        {level.label}
                  </Text>
                      <Text style={[
                        styles.accessLevelDescription,
                        selectedLevel === level.id && styles.accessLevelDescriptionSelected
                      ]}>
                        {level.description}
                      </Text>
                    </View>
                    {selectedLevel === level.id && (
                      <View style={[styles.selectedCheckmark, { backgroundColor: level.color + '15' }]}>
                        <Icon 
                          name="check"
                          size={16}
                          color={level.color}
                        />
                      </View>
                    )}
                </TouchableOpacity>
              ))}
            </View>
            </ScrollView>

            <View style={styles.accessModalActions}>
              <Button 
                onPress={onDismiss}
                style={[styles.accessModalButton, styles.cancelButton]}
                labelStyle={styles.cancelButtonText}
                mode="outlined"
              >
                Cancel
              </Button>
              <Button 
                mode="contained" 
                onPress={() => {
                  onSave(user, selectedLevel);
                  onDismiss();
                }}
                style={[styles.accessModalButton, styles.saveButton]}
                labelStyle={styles.saveButtonText}
              >
                Update Access
              </Button>
      </View>
          </View>
        </View>
      </Modal>
    </Portal>
  );
};

const UserAccessManagement = () => {
  const { user: currentUser } = useUser();
  const route = useRoute();
  const navigationKey = route.params?.key || `UserAccess-${Date.now()}`;
  const [showDepartmentMenu, setShowDepartmentMenu] = useState(false);
  const [departments, setDepartments] = useState(['All']);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentUserAccess, setCurrentUserAccess] = useState('Loading...');
  const [users, setUsers] = useState([]);
  const [selectedRole, setSelectedRole] = useState('admin');
  const [selectedUser, setSelectedUser] = useState(null);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('name'));
      const querySnapshot = await getDocs(q);
      
      const fetchedUsers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        uniqueKey: `${doc.id}-${navigationKey}`,
        ...doc.data()
      }));

      setUsers(fetchedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert(
        'Error',
        'Failed to fetch users. Please try again later.',
        [{ text: 'OK' }]
      );
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [navigationKey]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const usersByRole = useMemo(() => {
    if (!users || !Array.isArray(users)) return {};
    return users.reduce((acc, user) => {
      const role = user?.role?.toLowerCase() || 'other';
      acc[role] = (acc[role] || []).concat(user);
      return acc;
    }, {});
  }, [users]);

  const filteredUsers = useMemo(() => {
    if (!users || !Array.isArray(users)) return [];
    return users.filter(user => {
      const matchesSearch = user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          user.email?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole = !selectedRole || user.role?.toLowerCase() === selectedRole.toLowerCase();
      const matchesDepartment = selectedDepartment === 'All' || user.department === selectedDepartment;
      return matchesSearch && matchesRole && matchesDepartment;
    });
  }, [users, searchQuery, selectedRole, selectedDepartment]);

  const handleEdit = (userData) => {
    if (!userData) return;
    setSelectedRole(null);
    setSelectedUser(userData);
    setShowEditModal(true);
  };

  const handleChangeAccess = (user) => {
    if (!user) return;
    setSelectedRole(null);
    setSelectedUser(user);
    setShowAccessModal(true);
  };

  const handleSaveAccess = async (user, newAccessLevel) => {
    if (!user || !user.email) {
      Alert.alert('Error', 'Invalid user data');
      return;
    }

    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('email', '==', user.email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        throw new Error('User not found');
      }

      const userDoc = querySnapshot.docs[0];
      const userRef = doc(db, 'users', userDoc.id);

      await updateDoc(userRef, {
        accessLevel: newAccessLevel,
        lastUpdated: serverTimestamp(),
        updatedBy: currentUser?.email || 'system'
      });

      Alert.alert('Success', `Access level updated for ${user.name}`);
      fetchUsers(); // Refresh the user list
    } catch (error) {
      console.error('Error updating access level:', error);
      Alert.alert('Error', 'Failed to update access level. Please try again.');
    } finally {
      setLoading(false);
      setShowAccessModal(false);
    }
  };

  const handleSaveEdit = async (userData) => {
    if (!userData || !userData.id) {
      Alert.alert('Error', 'Invalid user data');
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'users', userData.id);
      const updateData = {
        name: userData.name,
        email: userData.email,
        department: userData.department,
        role: userData.role,
        designation: userData.designation,
        lastUpdated: serverTimestamp(),
        updatedBy: currentUser?.id || 'system'
      };

      await updateDoc(userRef, updateData);
      Alert.alert('Success', `User ${userData.name} updated successfully`);
      fetchUsers(); // Refresh the user list
    } catch (error) {
      console.error('Error updating user:', error);
      Alert.alert('Error', 'Failed to update user. Please try again.');
    } finally {
      setLoading(false);
      setShowEditModal(false);
    }
  };

  const handleModalDismiss = () => {
    setSelectedRole(null);
    setSelectedUser(null);
    setShowEditModal(false);
    setShowAccessModal(false);
  };

  const fetchDepartments = useCallback(async () => {
    try {
      const deptSet = new Set(['All']);
      const usersRef = collection(db, 'users');
      const usersSnap = await getDocs(usersRef);
      
      usersSnap.forEach(doc => {
        const userData = doc.data();
        if (userData.department) {
          deptSet.add(userData.department);
        }
      });

      setDepartments(Array.from(deptSet).sort());
    } catch (err) {
      console.error('Error fetching departments:', err);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    if (currentUser?.accessLevel) {
      setCurrentUserAccess(currentUser.accessLevel);
    } else {
      setCurrentUserAccess('Basic');
    }
  }, [currentUser]);

  const DepartmentDropdown = () => (
    <View style={styles.dropdownContainer}>
      <Text style={styles.dropdownLabel}>Department</Text>
      <Surface style={styles.dropdownSurface}>
        <Menu
          visible={showDepartmentMenu}
          onDismiss={() => setShowDepartmentMenu(false)}
          anchor={
        <TouchableOpacity 
              style={styles.dropdownButton}
              onPress={() => setShowDepartmentMenu(true)}
            >
              <Icon name="building" size={20} color="#1D3557" />
              <Text style={styles.dropdownButtonText}>
                {selectedDepartment === 'All' ? 'All Departments' : selectedDepartment}
              </Text>
              <Icon 
                name={showDepartmentMenu ? "chevron-up" : "chevron-down"} 
                size={16} 
                color="#1D3557" 
              />
        </TouchableOpacity>
          }
        >
          {departments.map(dept => (
            <Menu.Item
              key={dept}
              onPress={() => {
                setSelectedDepartment(dept);
                setShowDepartmentMenu(false);
              }}
              title={dept === 'All' ? 'All Departments' : dept}
            />
          ))}
        </Menu>
      </Surface>
      </View>
    );

  const renderSectionHeader = ({ section }) => (
    <View key={`section-${section.id}-${navigationKey}`} style={styles.sectionHeader}>
      <Icon name={section.icon} size={24} color="#1D3557" />
      <Text style={styles.sectionTitle}>{section.title}</Text>
      <Text style={styles.sectionCount}>{section.data.length}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
      <Text style={styles.title}>User Access Management</Text>
      <Text style={styles.subtitle}>
        Your Access Level: {currentUserAccess}
        {loading && ' (Updating...)'}
      </Text>
      </View>

      <View style={styles.rolesContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rolesScrollContent}
        >
          {Object.keys(ROLE_DESIGNATIONS).map((role) => (
            <RoleCard
              key={role}
              role={role.charAt(0).toUpperCase() + role.slice(1)}
              count={usersByRole[role.toLowerCase()]?.length || 0}
              onPress={() => setSelectedRole(role === selectedRole ? null : role)}
              isSelected={selectedRole === role}
            />
          ))}
        </ScrollView>
    </View>

      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search users..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          iconColor="#457B9D"
        />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1D3557" />
          <Text style={styles.loadingText}>Loading users...</Text>
        </View>
      ) : (
        <ScrollView style={styles.userList}>
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyStateContainer}>
              <Icon name="users-slash" size={48} color="#666" />
              <Text style={styles.emptyStateText}>No users found</Text>
              {searchQuery && (
                <Text style={styles.emptyStateSubtext}>
                  Try adjusting your search or filters
                </Text>
              )}
            </View>
          ) : (
            filteredUsers.map((user) => (
              <Card key={user.uniqueKey || user.email} style={styles.userCard}>
                <Card.Content style={styles.userCardContent}>
                  <View style={styles.userAvatarContainer}>
                    <View 
                      style={[
                        styles.userAvatar,
                        { backgroundColor: ROLE_COLORS[user.role?.toLowerCase()] + '15' }
                      ]}
                    >
                      <Icon 
                        name={ROLE_ICONS[user.role?.toLowerCase()] || 'user'} 
                        size={24} 
                        color={ROLE_COLORS[user.role?.toLowerCase()]} 
                      />
                    </View>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.name}</Text>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <View style={styles.userMetaInfo}>
                      <Text style={styles.userDepartment}>
                        {user.department || 'No Department'}
                      </Text>
                      <View style={styles.roleBadge}>
                        <Text style={[
                          styles.roleBadgeText,
                          { color: ROLE_COLORS[user.role?.toLowerCase()] }
                        ]}>
                          {user.designation || user.role}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity 
                    style={[
                      styles.accessButton,
                      { backgroundColor: ROLE_COLORS[user.role?.toLowerCase()] + '15' }
                    ]}
                    onPress={() => handleChangeAccess(user)}
                  >
                    <Icon 
                      name="shield-alt" 
                      size={20} 
                      color={ROLE_COLORS[user.role?.toLowerCase()]}
                    />
                  </TouchableOpacity>
                </Card.Content>
              </Card>
            ))
          )}
        </ScrollView>
      )}

      <AccessLevelModal
        visible={showAccessModal}
        onDismiss={handleModalDismiss}
        user={selectedUser}
        onSave={handleSaveAccess}
      />

      <EditModal
        visible={showEditModal}
        onDismiss={handleModalDismiss}
        userData={selectedUser}
        onSave={handleSaveEdit}
        currentUserAccess={currentUser?.accessLevel}
      />
    </SafeAreaView>
  );
};

export default UserAccessManagement;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  subtitle: {
    fontSize: 16,
    color: '#457B9D',
    marginTop: 4,
  },
  rolesContainer: {
    backgroundColor: 'white',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  rolesScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingVertical: 4,
  },
  roleCard: {
    width: 130,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E6E6E6',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
  },
  roleCardSelected: {
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    transform: [{ scale: 1.02 }],
  },
  roleIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  roleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 4,
    textAlign: 'center',
  },
  roleCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  selectedIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
  },
  searchBar: {
    elevation: 0,
    backgroundColor: '#F1F1F1',
    borderRadius: 12,
  },
  searchInput: {
    fontSize: 14,
  },
  userList: {
    flex: 1,
    padding: 16,
  },
  userCard: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: 'white',
  },
  userCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  userAvatarContainer: {
    marginRight: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 14,
    color: '#457B9D',
    marginBottom: 4,
  },
  userMetaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  userDepartment: {
    fontSize: 12,
    color: '#666',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: '#F8F9FA',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  accessButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  accessModalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  accessModalContent: {
    backgroundColor: 'white',
  },
  accessModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  accessModalHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accessModalIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  accessModalTitleContainer: {
    flex: 1,
  },
  accessModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 4,
  },
  accessModalSubtitle: {
    fontSize: 14,
    color: '#457B9D',
  },
  accessModalCloseButton: {
    margin: -8,
  },
  currentRoleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  currentRoleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  currentRoleInfo: {
    flex: 1,
  },
  currentRoleLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  currentRoleValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
  },
  accessLevelsScrollView: {
    maxHeight: 400,
  },
  accessLevelsList: {
    padding: 16,
    gap: 12,
  },
  accessLevelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    gap: 16,
  },
  accessLevelItemSelected: {
    backgroundColor: '#F8F9FA',
    borderColor: '#1D3557',
    transform: [{ scale: 1.02 }],
  },
  accessLevelIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessLevelInfo: {
    flex: 1,
  },
  accessLevelTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 4,
  },
  accessLevelTitleSelected: {
    color: '#1D3557',
  },
  accessLevelDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  accessLevelDescriptionSelected: {
    color: '#457B9D',
  },
  selectedCheckmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accessModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    gap: 12,
  },
  accessModalButton: {
    minWidth: 120,
    borderRadius: 8,
  },
  cancelButton: {
    borderColor: '#E9ECEF',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#1D3557',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownContainer: {
    marginBottom: 16,
  },
  dropdownLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
    marginBottom: 8,
  },
  dropdownSurface: {
    elevation: 2,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  dropdownButtonText: {
    flex: 1,
    fontSize: 16,
    color: '#1D3557',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D3557',
    marginLeft: 12,
    flex: 1,
  },
  sectionCount: {
    fontSize: 16,
    color: '#457B9D',
    fontWeight: '500',
  },
  expandedContent: {
    marginTop: 12,
  },
  divider: {
    marginVertical: 12,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  detailItem: {
    width: '50%',
    paddingVertical: 4,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#1D3557',
    fontWeight: '500',
  },
  editButton: {
    marginTop: 8,
  },
  modalContent: {
    padding: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 0,
    padding: 20,
  },
  editModalContainer: {
    position: 'relative',
    width: '90%',
    maxWidth: 500,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 24,
    zIndex: 1001,
  },
  editModalContent: {
    maxHeight: '90%',
    display: 'flex',
    flexDirection: 'column',
  },
  editFormContainer: {
    padding: 20,
  },
  formSection: {
    marginBottom: 24,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#457B9D',
    marginBottom: 8,
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: '#fff',
    fontSize: 16,
  },
  disabledInput: {
    backgroundColor: '#f8f9fa',
    color: '#6c757d',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  dropdownButtonSelected: {
    borderColor: '#457B9D',
    backgroundColor: '#F8F9FA',
  },
  dropdownButtonText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#1D3557',
  },
  menu: {
    marginTop: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E9ECEF',
    backgroundColor: '#fff',
  },
  footerButton: {
    minWidth: 120,
    marginLeft: 12,
  },
  saveButton: {
    backgroundColor: '#1D3557',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#1D3557',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F8F9FA',
  },
  emptyStateText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: '#1D3557',
  },
  emptyStateSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
    backgroundColor: 'white',
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 12,
    color: '#1D3557',
  },
  closeButton: {
    margin: 0,
  },
  modalFilters: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
    gap: 12,
  },
  modalSearchBar: {
    elevation: 0,
    backgroundColor: '#F1F1F1',
    borderRadius: 12,
  },
  filterButtonContainer: {
    borderColor: '#E6E6E6',
    borderRadius: 12,
  },
  filterButton: {
    height: 40,
  },
  departmentMenu: {
    marginTop: 4,
  },
  selectedMenuItem: {
    backgroundColor: '#F1F1F1',
  },
  selectedMenuItemText: {
    color: '#1D3557',
    fontWeight: '600',
  },
  modalScrollView: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  modalScrollContent: {
    padding: 16,
    gap: 12,
  },
  modalEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalEmptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1D3557',
    marginTop: 16,
  },
  modalEmptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  modalUserCard: {
    borderRadius: 12,
    elevation: 2,
    backgroundColor: 'white',
    marginBottom: 0,
  },
  modalUserContent: {
    padding: 12,
  },
  modalUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalUserDetails: {
    flex: 1,
  },
  modalUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1D3557',
  },
  modalUserEmail: {
    fontSize: 14,
    color: '#457B9D',
    marginTop: 2,
  },
  modalUserMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  modalUserDepartment: {
    fontSize: 12,
    color: '#666',
  },
  modalUserBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  modalUserRole: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalAccessButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  accessModalContainer: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});