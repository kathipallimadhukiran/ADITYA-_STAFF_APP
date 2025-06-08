import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, Card, FAB, useTheme, IconButton, Surface } from 'react-native-paper';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ViewSchedulePage = () => {
  const navigation = useNavigation();
  const [selectedDay, setSelectedDay] = useState(daysOfWeek[0]);
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const theme = useTheme();

  // Load schedule data when screen is focused
  useFocusEffect(
    React.useCallback(() => {
      loadSchedule();
    }, [])
  );

  const loadSchedule = async () => {
    try {
      setLoading(true);
      const savedSchedule = await AsyncStorage.getItem('schedule');
      if (savedSchedule) {
        setSchedule(JSON.parse(savedSchedule));
      }
    } catch (error) {
      console.error('Error loading schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderDayTabs = () => (
    <View style={styles.tabsWrapper}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false} 
        style={styles.tabsContainer}
        contentContainerStyle={styles.tabsContentContainer}
      >
        {daysOfWeek.map((day) => (
          <TouchableOpacity
            key={day}
            onPress={() => setSelectedDay(day)}
            style={[
              styles.dayTab,
              selectedDay === day && styles.selectedDayTab
            ]}
          >
            <Text style={[
              styles.dayTabText,
              selectedDay === day && styles.selectedDayTabText
            ]}>
              {day.substring(0, 3)}
            </Text>
            <View style={[
              styles.dayIndicator,
              selectedDay === day && styles.selectedDayIndicator
            ]} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderScheduleCards = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      );
    }

    const daySchedule = schedule[selectedDay] || [];

    if (daySchedule.length === 0) {
      return (
        <View style={styles.centerContainer}>
          <Surface style={styles.emptyStateContainer}>
            <IconButton
              icon="calendar-blank"
              size={50}
              iconColor={theme.colors.primary}
            />
            <Text style={styles.emptyText}>No classes scheduled for {selectedDay}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('EditSchedulePage', { selectedDay })}
            >
              <Text style={styles.addButtonText}>Add Class</Text>
            </TouchableOpacity>
          </Surface>
        </View>
      );
    }

    return (
      <ScrollView 
        style={styles.scheduleContainer}
        contentContainerStyle={styles.scheduleContentContainer}
      >
        {daySchedule.map((session, index) => (
          <Card key={index} style={styles.scheduleCard} mode="elevated">
            <Card.Content style={styles.cardContent}>
              <View style={styles.cardHeader}>
                <View style={styles.timeContainer}>
                  <IconButton
                    icon="clock-outline"
                    size={20}
                    iconColor={theme.colors.primary}
                    style={styles.timeIcon}
                  />
                  <Text style={styles.timeText}>{session.time}</Text>
                </View>
                <IconButton
                  icon="pencil"
                  size={20}
                  mode="contained"
                  containerColor={theme.colors.primaryContainer}
                  iconColor={theme.colors.primary}
                  onPress={() => navigation.navigate('EditSchedulePage', {
                    selectedDay,
                    sessionIndex: index,
                    sessionData: session
                  })}
                />
              </View>
              <Text style={styles.subjectText}>{session.subject}</Text>
              <View style={styles.detailsContainer}>
                <View style={styles.detailItem}>
                  <IconButton
                    icon="door"
                    size={18}
                    iconColor="#666"
                    style={styles.detailIcon}
                  />
                  <Text style={styles.detailText}>Room {session.roomNo}</Text>
                </View>
                <View style={styles.detailItem}>
                  <IconButton
                    icon="account-group"
                    size={18}
                    iconColor="#666"
                    style={styles.detailIcon}
                  />
                  <Text style={styles.detailText}>Section {session.section}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        ))}
      </ScrollView>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Class Schedule</Text>
        <IconButton
          icon="calendar-sync"
          size={24}
          mode="contained"
          containerColor={theme.colors.primaryContainer}
          iconColor={theme.colors.primary}
          onPress={loadSchedule}
        />
      </View>
      {renderDayTabs()}
      {renderScheduleCards()}
      <FAB
        style={styles.fab}
        icon="plus"
        label="Add Class"
        onPress={() => navigation.navigate('EditSchedulePage', { selectedDay })}
        color="white"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 8,
    paddingTop: 8,
    backgroundColor: 'white',
    elevation: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    padding: 16,
    color: '#333',
  },
  tabsWrapper: {
    backgroundColor: 'white',
    paddingBottom: 8,
    elevation: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
  },
  tabsContentContainer: {
    paddingHorizontal: 12,
  },
  dayTab: {
    height: 45,
    paddingHorizontal: 20,
    marginHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedDayTab: {
    backgroundColor: 'transparent',
  },
  dayTabText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  selectedDayTabText: {
    color: '#000',
    fontWeight: 'bold',
  },
  dayIndicator: {
    height: 3,
    width: 20,
    borderRadius: 1.5,
    backgroundColor: 'transparent',
    marginTop: 4,
  },
  selectedDayIndicator: {
    backgroundColor: '#2196F3',
  },
  scheduleContainer: {
    flex: 1,
  },
  scheduleContentContainer: {
    padding: 16,
  },
  scheduleCard: {
    marginBottom: 12,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: 'white',
  },
  cardContent: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f7ff',
    paddingRight: 12,
    borderRadius: 20,
  },
  timeIcon: {
    margin: 0,
  },
  timeText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#2196F3',
  },
  subjectText: {
    fontSize: 20,
    fontWeight: 'bold',
    marginVertical: 8,
    color: '#333',
  },
  detailsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 4,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 24,
  },
  detailIcon: {
    margin: 0,
    marginRight: -4,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: '#2196F3',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateContainer: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    backgroundColor: 'white',
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginVertical: 16,
    textAlign: 'center',
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
    elevation: 2,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default ViewSchedulePage;