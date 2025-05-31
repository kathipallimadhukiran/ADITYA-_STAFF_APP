import React from 'react';
import AuthScreen from './AuthScreen';

const AdminAuth = ({ navigation }) => {
  const handleAuthSuccess = (user) => {
    // Navigate to admin dashboard or handle success
    navigation.replace('AdminDashboard');
  };

  return <AuthScreen userType="admin" onAuthSuccess={handleAuthSuccess} />;
};

export default AdminAuth; 