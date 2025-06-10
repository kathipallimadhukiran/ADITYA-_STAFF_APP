import React, { useMemo } from 'react';
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

// Valid roles configuration
const VALID_ROLES = ['student', 'staff', 'admin'];
const DEFAULT_ROLE = 'student';

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
      name: "StaffAttendanceTracker",
      component: StaffAttendanceTracker,
      options: { headerShown: true }
    },
    {
      name: "StaffLocationTracker",
      component: StaffLocationTracker,
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
      name: "StaffAttendanceTracker",
      component: StaffAttendanceTracker,
      options: { headerShown: true }
    },
    {
      name: "StaffLocationTracker",
      component: StaffLocationTracker,
      options: { headerShown: true }
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

export default function AppNavigator({ isLoggedIn, userRole }) {
  const { screens, initialRoute } = useMemo(() => {
    const getScreens = () => {
      // Always include auth screens and role-specific screens
      const baseScreens = [...authScreens, faceCaptureScreen];
      
      if (!isLoggedIn) {
        return baseScreens;
      }

      const validRole = validateRole(userRole);
      const roleScreens = roleSpecificScreens[validRole] || [];
      
      // Combine screens ensuring no duplicates
      const allScreens = [...baseScreens, ...roleScreens, ...commonScreens];
      return allScreens.filter(
        (screen, index, self) => index === self.findIndex((s) => s.name === screen.name)
      );
    };

    const getInitialRoute = () => {
      if (!isLoggedIn) return 'Login';
      const validRole = validateRole(userRole);
      return `${validRole.charAt(0).toUpperCase() + validRole.slice(1)}Dashboard`;
    };

    return {
      screens: getScreens(),
      initialRoute: getInitialRoute()
    };
  }, [isLoggedIn, userRole]);

  // Validate navigation setup
  if (!debugNavigation(screens, initialRoute, userRole)) {
    const fallbackRoute = isLoggedIn ? 'Profile' : 'Login';
    console.warn(`[NAVIGATION WARNING] Falling back to ${fallbackRoute} due to invalid initial route for role: ${userRole}`);
  }

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