import React from 'react';
import AuthScreen from './AuthScreen';

const StaffAuth = ({ navigation }) => {
  const handleAuthSuccess = (user) => {
    // Navigate to staff dashboard or handle success
    navigation.replace('StaffDashboard');
  };

  return <AuthScreen userType="staff" onAuthSuccess={handleAuthSuccess} />;
};

export default StaffAuth; 