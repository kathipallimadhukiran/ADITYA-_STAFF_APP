import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import Attendance_fig_cam from '../screens/Attendance/Attendance_fig&cam';
import ProfileScreen from '../screens/profile/profilescreen';
import EditProfile from '../screens/profile/EditProfile';
import ViewSchedulePage from '../screens/Schedule/ViewSchedulePage';
import FaceCaptureScreen from '../screens/Auth/FaceCaptureScreen';
import MyTasksScreen from '../screens/Dashboard/MyTasksScreen';
import UserAccessManagement from '../screens/Admin/UserAccessManagement';
import StaffAttendanceTracker from '../screens/Admin/StaffAttendanceTracker';
import StaffLocationTracker from '../screens/Admin/StaffLocationTracker';
import AppointmentsScreen from '../screens/Dashboard/AppointmentsScreen';
import MessagesScreen from '../screens/Dashboard/MessagesScreen';
import LocationTracker from '../screens/Staff/LocationTracker';
import RoleSelection from '../screens/Auth/auth/RoleSelection';
import DigitalIDCard from '../screens/Dashboard/DigitalIDCard';

const Stack = createNativeStackNavigator();

export default function AppNavigator({ isLoggedIn, userRole }) {
  console.log('[DEBUG] AppNavigator render:', { 
    isLoggedIn, 
    userRole
  });

  if (!isLoggedIn) {
    console.log('[DEBUG] Rendering auth stack');
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen 
          name="Login" 
          component={LoginScreen}
        />
        <Stack.Screen name="RoleSelection" component={RoleSelection} />
        <Stack.Screen 
          name="StudentSignup" 
          component={SignupScreen} 
          initialParams={{ userType: 'student' }}
        />
        <Stack.Screen 
          name="StaffSignup" 
          component={SignupScreen} 
          initialParams={{ userType: 'staff' }}
        />
        <Stack.Screen 
          name="AdminSignup" 
          component={SignupScreen} 
          initialParams={{ userType: 'admin' }}
        />
      </Stack.Navigator>
    );
  }

  console.log('[DEBUG] Rendering authenticated stack for role:', userRole);
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {userRole === 'student' ? (
        <>
          <Stack.Screen   name="StudentDashboard"  component={DashboardScreen} options={{ headerShown: false}} />
          <Stack.Screen name="ViewSchedule" component={ViewSchedulePage} options={{ headerShown: true }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true }} />
          <Stack.Screen name="EditProfile" component={EditProfile} options={{ headerShown: false }} />
          <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ headerShown: true }} />
          <Stack.Screen name="Appointments" component={AppointmentsScreen} options={{ headerShown: true }} />
          <Stack.Screen  name="DigitalIDCard"  component={DigitalIDCard}  options={{  headerShown: true, title: 'Digital ID Card' }} 
          />
        </>
      ) : userRole === 'staff' ? (
        <>
          <Stack.Screen name="StaffDashboard" component={DashboardScreen} options={{ headerShown: false  }}/>
          <Stack.Screen name="MarkAttendance" component={Attendance_fig_cam} options={{ headerShown: true }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true }} />
          <Stack.Screen name="EditProfile" component={EditProfile} options={{ headerShown: true }} />
          <Stack.Screen name="ViewSchedule" component={ViewSchedulePage} options={{ headerShown: true }} />
          <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ headerShown: true }} />
          <Stack.Screen name="Appointments" component={AppointmentsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Messages" component={MessagesScreen} options={{ headerShown: true }} />
          <Stack.Screen name="TrackLocation" component={LocationTracker} options={{ headerShown: true }} />
        </>
      ) : (
        <>
          <Stack.Screen  name="AdminDashboard"  component={DashboardScreen} options={{  headerShown: false   }}/>
          <Stack.Screen  name="UserAccessManagement" component={UserAccessManagement}    options={{  headerShown: true,  title: 'User Access Management' }}  />
          <Stack.Screen name="MarkAttendance" component={Attendance_fig_cam} options={{ headerShown: true }} />
      
          <Stack.Screen  name="StaffLocationTracker"  component={StaffLocationTracker}   options={{  headerShown: true,  title: 'Track Staff Location' }}  />
          <Stack.Screen name="ViewSchedule" component={ViewSchedulePage} options={{ headerShown: true }} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true }} />
          <Stack.Screen name="EditProfile" component={EditProfile} options={{ headerShown: true }} />
          <Stack.Screen name="MyTasksScreen" component={MyTasksScreen} options={{ headerShown: true }} />
          <Stack.Screen name="Appointments" component={AppointmentsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Messages" component={MessagesScreen} options={{ headerShown: true }} />
        </>
      )}
      <Stack.Screen name="FaceCaptureScreen" component={FaceCaptureScreen} />
    </Stack.Navigator>
  );
}
