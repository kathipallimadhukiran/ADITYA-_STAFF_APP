import Realm from 'realm';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define your schemas here
const LocationSchema = {
  name: 'Location',
  primaryKey: '_id',
  properties: {
    _id: 'objectId',
    latitude: 'double',
    longitude: 'double',
    timestamp: 'date',
    accuracy: 'double?',
    altitude: 'double?',
    speed: 'double?',
    heading: 'double?',
    email: 'string?',
    userRole: 'string?',
    isBackground: 'bool?',
    deviceInfo: 'mixed?',
  },
};

const SCHEMA_VERSION_KEY = '@realm_schema_version';
const CURRENT_SCHEMA_VERSION = 1;

// Function to get the last schema version
const getLastSchemaVersion = async () => {
  try {
    const version = await AsyncStorage.getItem(SCHEMA_VERSION_KEY);
    return version ? parseInt(version, 10) : 0;
  } catch (error) {
    console.error('[Realm] Error getting schema version:', error);
    return 0;
  }
};

// Function to save the current schema version
const saveSchemaVersion = async () => {
  try {
    await AsyncStorage.setItem(SCHEMA_VERSION_KEY, CURRENT_SCHEMA_VERSION.toString());
  } catch (error) {
    console.error('[Realm] Error saving schema version:', error);
  }
};

// Export a function that returns the Realm configuration
export const getRealmConfig = async () => {
  const lastVersion = await getLastSchemaVersion();
  
  // If this is a fresh install or major version upgrade, we can delete the realm
  if (lastVersion === 0 || lastVersion < CURRENT_SCHEMA_VERSION) {
    return {
      schema: [LocationSchema],
      schemaVersion: CURRENT_SCHEMA_VERSION,
      path: 'aditya.realm',
      deleteRealmIfMigrationNeeded: true,
      onAfterMigration: async () => {
        // Save the new schema version after successful migration
        await saveSchemaVersion();
      }
    };
  }

  // For normal operation, use migration handler
  return {
    schema: [LocationSchema],
    schemaVersion: CURRENT_SCHEMA_VERSION,
    path: 'aditya.realm',
    onMigration: (oldRealm, newRealm) => {
      // Handle migrations here if needed
      console.log('[Realm] Running migration from version', oldRealm.schemaVersion, 'to', CURRENT_SCHEMA_VERSION);
      
      // Add migration logic here if needed in the future
      // For now, we just log the migration event
    },
    onAfterMigration: async () => {
      // Save the new schema version after successful migration
      await saveSchemaVersion();
    }
  };
};

// Create a singleton instance
let realmInstance = null;

export const getRealm = async () => {
  if (!realmInstance) {
    try {
      const config = await getRealmConfig();
      realmInstance = await Realm.open(config);
      console.log('[Realm] Opened successfully with schema version:', CURRENT_SCHEMA_VERSION);
    } catch (error) {
      console.error('[Realm] Error opening Realm:', error);
      throw error;
    }
  }
  return realmInstance;
};

export const closeRealm = () => {
  if (realmInstance) {
    try {
      realmInstance.close();
      realmInstance = null;
      console.log('[Realm] Closed successfully');
    } catch (error) {
      console.error('[Realm] Error closing Realm:', error);
    }
  }
}; 