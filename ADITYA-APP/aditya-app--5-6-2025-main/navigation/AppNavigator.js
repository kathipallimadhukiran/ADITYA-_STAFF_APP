import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/Auth/LoginScreen';
import SignupScreen from '../screens/Auth/SignupScreen';
import DashboardScreen from '../screens/Dashboard/DashboardScreen';
import Attendance_fig_cam from '../screens/Attendance/Attendance_fig&cam';
import ViewAttendanceScreen from '../screens/Attendance/ViewAttendanceScreen';
import ProfileScreen from '../screens/profile/profilescreen';
import EditProfile from '../screens/profile/EditProfile';
import ViewSchedulePage from '../screens/Schedule/ViewSchedulePage';
import EditSchedulePage from '../screens/Schedule/EditSchedulePage';
import FaceCaptureScreen from '../screens/Auth/FaceCaptureScreen';
import MyTasksScreen from '../screens/Dashboard/MyTasksScreen';
import UserAccessManagement from '../screens/Admin/UserAccessManagement';
import StaffAttendanceTracker from '../screens/Admin/StaffAttendanceTracker';
import StaffLocationTracker from '../screens/Admin/StaffLocationTracker';
import AppointmentsScreen from '../screens/Dashboard/AppointmentsScreen';
import NoticesScreen from '../screens/Notices/NoticesScreen';
import ViewLocationsScreen from '../screens/Tracking/ViewLocationsScreen';
import RoleSelection from '../screens/Auth/RoleSelection';
import DigitalIDCard from '../screens/Dashboard/DigitalIDCard';
import Results from '../screens/student/ResultsSccreen';
import AttendanceSettings from '../screens/Admin/AttendanceSettings';

const Stack = createNativeStackNavigator();

// Common screens configuration shared between roles
const commonScreens = [
  {
    name: "Profile",
    component: ProfileScreen,
    options: { headerShown: true }
  },
  {
    name: "ViewAttendance",
    component: ViewAttendanceScreen,
    options: { headerShown: true, title: 'My Attendance' }
  },
  {
    name: "EditProfile",
    component: EditProfile,
    options: { headerShown: false }
  },
  {
    name: "ViewSchedule",
    component: ViewSchedulePage,
    options: { headerShown: true }
  },
  {
    name: "MyTasksScreen",
    component: MyTasksScreen,
    options: { headerShown: true, title: 'My Tasks' }
  },
  {
    name: "DigitalIDCard",
    component: DigitalIDCard,
    options: { headerShown: true, title: 'Digital ID Card' }
  },
  {
    name: "Appointments",
    component: AppointmentsScreen,
    options: { headerShown: true }
  },
  {
    name: "Notices",
    component: NoticesScreen,
    options: { headerShown: true, title: 'Notices' }
  },
  {
    name: "ViewLocations",
    component: ViewLocationsScreen,
    options: { headerShown: true, title: 'All Locations' }
  }
];

// Auth stack screens
const authScreens = [
  {
    name: "Login",
    component: LoginScreen,
    options: { headerShown: false }
  },
  {
    name: "RoleSelection",
    component: RoleSelection,
    options: { headerShown: false }
  },
  {
    name: "StudentSignup",
    component: SignupScreen,
    initialParams: { userType: 'student' }
  },
  {
    name: "StaffSignup",
    component: SignupScreen,
    initialParams: { userType: 'staff' }
  },
  {
    name: "AdminSignup",
    component: SignupScreen,
    initialParams: { userType: 'admin' }
  }
];

// Role-specific screens
const roleSpecificScreens = {
  student: [
    {
      name: "StudentDashboard",
      component: DashboardScreen,
      options: { headerShown: false }
    },
    {
      name: "Results",
      component: Results,
      options: { headerShown: true }
    }
  ],
  staff: [
    {
      name: "StaffDashboard",
      component: DashboardScreen,
      options: { headerShown: false }
    },
    {
      name: "MarkAttendance",
      component: Attendance_fig_cam,
      options: { headerShown: true }
    }
  ],
  admin: [
    {
      name: "AdminDashboard",
      component: DashboardScreen,
      options: { headerShown: false }
    },
    {
      name: "UserAccessManagement",
      component: UserAccessManagement,
      options: { headerShown: true, title: 'User Access Management' }
    },
    {
      name: "MarkAttendance",
      component: Attendance_fig_cam,
      options: { headerShown: true }
    },
    {
      name: "AttendanceSettings",
      component: AttendanceSettings,
      options: { headerShown: true, title: 'Attendance Settings' }
    }
  ]
};

// Face capture screen configuration
const faceCaptureScreen = {
  name: "FaceCaptureScreen",
  component: FaceCaptureScreen,
  options: {
    headerShown: true,
    title: 'Face Registration',
    headerStyle: {
      backgroundColor: '#f4511e',
    },
    headerTintColor: '#fff',
  }
};

export default function AppNavigator({ isLoggedIn, userRole }) {
  console.log('[DEBUG] AppNavigator render:', { isLoggedIn, userRole });

  const getScreens = () => {
    if (!isLoggedIn) {
      return [...authScreens, faceCaptureScreen];
    }

    const normalizedRole = userRole?.toLowerCase() || 'student';
    const roleScreens = roleSpecificScreens[normalizedRole] || roleSpecificScreens['student'];
    return [...roleScreens, ...commonScreens, faceCaptureScreen];
  };

  const getInitialRoute = () => {
    if (!isLoggedIn) {
      return 'Login';
    }
    const normalizedRole = userRole?.toLowerCase() || 'student';
    return `${normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1)}Dashboard`;
  };

  const screens = getScreens();
  const initialRoute = getInitialRoute();

  console.log('[DEBUG] Navigation setup:', {
    isLoggedIn,
    userRole,
    initialRoute,
    availableScreens: screens.map(s => s.name)
  });

  return (
    <Stack.Navigator 
      initialRouteName={initialRoute}
      screenOptions={{ 
        headerShown: false,
        animation: 'none',
        animationEnabled: false,
        detachInactiveScreens: true,
        freezeOnBlur: true
      }}
    >
      {screens.map(screen => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={{
            ...screen.options,
            animationEnabled: false
          }}
          initialParams={screen.initialParams}
        />
      ))}
      <Stack.Screen 
        name="EditSchedulePage" 
        component={EditSchedulePage}
        options={{ 
          headerShown: false,
          animationEnabled: false
        }}
      />
    </Stack.Navigator>
  );
}
