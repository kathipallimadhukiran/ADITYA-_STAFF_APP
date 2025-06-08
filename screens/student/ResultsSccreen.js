import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const ResultsScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Coming Soon!</Text>
      <Text style={styles.subtitle}>We're working on something amazing.</Text>
      <Text style={styles.description}>The results feature will be available in the next update.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
  },
});

export default ResultsScreen;
