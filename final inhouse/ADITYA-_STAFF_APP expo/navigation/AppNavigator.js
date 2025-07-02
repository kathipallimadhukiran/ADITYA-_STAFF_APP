import React, { useMemo, forwardRef } from 'react';
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
import LocationPermissionScreen from '../components/LocationPermissionScreen';
import TestCamera from '../test-camera';
import CameraTest from '../screens/Attendance/CameraTest';

const Stack = createNativeStackNavigator();

// Valid roles configuration
const VALID_ROLES = ['student', 'staff', 'admin', 'faculty'];
const DEFAULT_ROLE = 'student';

// Common screens configuration shared between roles
const commonScreens = [
  {
    name: "LocationPermissionScreen",
    component: LocationPermissionScreen,
    options: { 
      headerShown: false,
      gestureEnabled: false
    }
  },
  {
    name: "TestCamera",
    component: TestCamera,
    options: { 
      headerShown: true,
      title: "Camera Test"
    }
  },
  {
    name: "CameraTest",
    component: CameraTest,
    options: { 
      headerShown: true,
      title: "New Camera Test"
    }
  },
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
    name: "EditSchedulePage",
    component: EditSchedulePage,
    options: { headerShown: true, title: 'Edit Schedule' }
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
  },
  {
    name: "MarkAttendance",
    component: Attendance_fig_cam,
    options: { headerShown: true, title: 'Mark Attendance' }
  },
  {
    name: "AttendanceSettings",
    component: AttendanceSettings,
    options: { headerShown: true, title: 'Attendance Settings' }
  },
  {
    name: "UserAccessManagement",
    component: UserAccessManagement,
    options: { 
      headerShown: true, 
      title: 'User Access Management',
      headerBackTitleVisible: false
    }
  },
  {
    name: "StaffAttendanceTracker",
    component: StaffAttendanceTracker,
    options: { headerShown: true, title: 'Staff Attendance Tracker' }
  },
  {
    name: "StaffLocationTracker",
    component: StaffLocationTracker,
    options: { headerShown: true, title: 'Staff Location Tracker' }
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
    initialParams: { userType: 'student' },
    options: { headerShown: false }
  },
  {
    name: "FacultySignup",
    component: SignupScreen,
    initialParams: { userType: 'faculty' },
    options: { headerShown: false }
  },
  {
    name: "StaffSignup",
    component: SignupScreen,
    initialParams: { userType: 'staff' },
    options: { headerShown: false }
  },
  {
    name: "AdminSignup",
    component: SignupScreen,
    initialParams: { userType: 'admin' },
    options: { headerShown: false }
  }
];

// Role-specific screens
const roleSpecificScreens = {
  student: [
    {
      name: "StudentDashboard",
      component: DashboardScreen,
      initialParams: { userType: 'student' },
      options: { 
        headerShown: false,
        title: 'Student Dashboard'
      }
    },
    {
      name: "Results",
      component: Results,
      options: { headerShown: true }
    }
  ],
  faculty: [
    {
      name: "FacultyDashboard",
      component: DashboardScreen,
      initialParams: { userType: 'faculty' },
      options: { 
        headerShown: false,
        title: 'Faculty Dashboard'
      }
    }
  ],
  staff: [
    {
      name: "StaffDashboard",
      component: DashboardScreen,
      initialParams: { userType: 'staff' },
      options: { 
        headerShown: false,
        title: 'Staff Dashboard'
      }
    }
  ],
  admin: [
    {
      name: "AdminDashboard",
      component: DashboardScreen,
      initialParams: { userType: 'admin' },
      options: { 
        headerShown: false,
        title: 'Admin Dashboard'
      }
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

const validateRole = (role) => {
  if (!role || typeof role !== 'string') return DEFAULT_ROLE;
  const normalizedRole = role.toLowerCase();
  return VALID_ROLES.includes(normalizedRole) ? normalizedRole : DEFAULT_ROLE;
};

const debugNavigation = (screens, initialRoute, userRole) => {
  const screenNames = screens.map(s => s.name);
  if (!screenNames.includes(initialRoute)) {
    console.error('[NAVIGATION ERROR] Initial route not in available screens:', {
      initialRoute,
      availableScreens: screenNames,
      userRole
    });
    return false;
  }
  return true;
};

const AppNavigator = forwardRef(({ isLoggedIn, userRole, shouldNavigateToLogin, initialRoute }, ref) => {
  const getScreens = () => {
    const role = validateRole(userRole);
    
    // Map faculty role to staff screens
    const effectiveRole = role === 'faculty' ? 'staff' : role;
    
    // Get role-specific screens
    const roleScreens = roleSpecificScreens[effectiveRole] || roleSpecificScreens[DEFAULT_ROLE];

    // Debug log for screen registration
    console.log('[DEBUG] Registering screens:', {
      originalRole: role,
      effectiveRole,
      roleSpecificScreens: roleScreens.map(s => s.name),
      commonScreens: commonScreens.map(s => s.name),
      authScreens: authScreens.map(s => s.name),
      initialRoute
    });

    // Return all available screens for the Stack Navigator
    return {
      screens: [
        ...authScreens,
        ...Object.values(roleSpecificScreens).flat(), // Include all role-specific screens
        ...commonScreens,
        faceCaptureScreen
      ],
      initialRoute: initialRoute || (isLoggedIn ? `${effectiveRole.charAt(0).toUpperCase() + effectiveRole.slice(1)}Dashboard` : 'Login')
    };
  };

  const { screens, initialRoute: actualInitialRoute } = getScreens();

  // Validate navigation setup
  const screenNames = screens.map(s => s.name);
  console.log('[DEBUG] Navigation setup:', {
    availableRoutes: screenNames,
    initialRoute: actualInitialRoute,
    userRole,
    isLoggedIn
  });

  // Create the Stack Navigator
  return (
    <Stack.Navigator
      initialRouteName={actualInitialRoute}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#1D3557',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      {screens.map((screen) => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          component={screen.component}
          options={screen.options}
          initialParams={screen.initialParams}
        />
      ))}
    </Stack.Navigator>
  );
});

export default AppNavigator;