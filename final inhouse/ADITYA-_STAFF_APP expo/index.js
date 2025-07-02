import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import App from './App';

// Define the background task
try {
  if (TaskManager.isTaskDefined('background-location-task')) {
    console.log('Task already defined');
  } else {
    TaskManager.defineTask('background-location-task', async () => {
      try {
        // This will be handled by LocationService
        return { success: true };
      } catch (error) {
        console.error('Background task error:', error);
        return { success: false, error: error.message };
      }
    });
  }
} catch (error) {
  console.error('Error initializing TaskManager:', error);
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
