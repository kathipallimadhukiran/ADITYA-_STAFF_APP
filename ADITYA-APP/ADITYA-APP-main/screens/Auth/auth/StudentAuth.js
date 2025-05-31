import React from 'react';
import AuthScreen from './AuthScreen';

const StudentAuth = ({ navigation }) => {
  const handleAuthSuccess = (user) => {
    // Navigate to student dashboard or handle success
    navigation.replace('StudentDashboard');
  };

  return <AuthScreen userType="student" onAuthSuccess={handleAuthSuccess} />;
};

export default StudentAuth; 