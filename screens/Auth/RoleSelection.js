import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

const RoleSelection = ({ navigation }) => {
  const roles = [
    { id: 'student', title: 'Student', icon: 'school', screen: 'StudentSignup' },
    { id: 'faculty', title: 'Faculty', icon: 'book', screen: 'FacultySignup' },
    { id: 'staff', title: 'Staff', icon: 'briefcase', screen: 'StaffSignup' },
    { id: 'admin', title: 'Admin', icon: 'shield', screen: 'AdminSignup' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color="#f97316" />
        </TouchableOpacity>

        <Text style={styles.heading}>ADITYA UNIVERSITY</Text>
        <Text style={styles.title}>Select Your Role</Text>
        <Text style={styles.subtitle}>Choose your role to continue with registration</Text>

        <View style={styles.buttonContainer}>
          {roles.map((role) => (
            <TouchableOpacity
              key={role.id}
              style={styles.button}
              onPress={() => navigation.navigate(role.screen, { userType: role.id })}
            >
              <Icon name={role.icon} size={24} color="#fff" />
              <Text style={styles.buttonText}>{role.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff7ed',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    padding: 20,
  },
  backButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    padding: 10,
  },
  heading: {
    fontSize: 36,
    fontWeight: '900',
    color: '#ea580c',
    textAlign: 'center',
    letterSpacing: 3,
    marginBottom: 10,
    fontFamily: 'HelveticaNeue-Bold',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#16a34a',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue-Medium',
  },
  subtitle: {
    fontSize: 16,
    color: '#737373',
    marginBottom: 40,
    textAlign: 'center',
    fontFamily: 'HelveticaNeue',
  },
  buttonContainer: {
    width: '100%',
    maxWidth: 300,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f97316',
    padding: 20,
    borderRadius: 12,
    marginBottom: 15,
    shadowColor: '#f97316',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 15,
    fontFamily: 'HelveticaNeue-Medium',
  },
});

export default RoleSelection; 