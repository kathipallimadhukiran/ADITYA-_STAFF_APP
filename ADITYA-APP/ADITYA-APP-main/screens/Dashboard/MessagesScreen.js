import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Card, Avatar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

const MessagesScreen = () => {
  const [messages] = useState([
    {
      id: '1',
      sender: 'Principal',
      avatar: 'P',
      message: 'Please submit the monthly report by tomorrow.',
      time: '10:30 AM',
      unread: true,
    },
    {
      id: '2',
      sender: 'Department Head',
      avatar: 'D',
      message: 'Meeting rescheduled to 3 PM today.',
      time: '9:15 AM',
      unread: false,
    },
    {
      id: '3',
      sender: 'Admin Office',
      avatar: 'A',
      message: 'New schedule updates available.',
      time: 'Yesterday',
      unread: false,
    },
  ]);

  const renderMessage = ({ item }) => (
    <TouchableOpacity
      onPress={() => Alert.alert('Coming Soon', 'Message details will be available soon!')}
    >
      <Card style={[styles.messageCard, item.unread && styles.unreadCard]}>
        <Card.Content style={styles.messageContent}>
          <Avatar.Text 
            size={40} 
            label={item.avatar}
            style={styles.avatar}
          />
          <View style={styles.messageDetails}>
            <View style={styles.messageHeader}>
              <Text style={styles.senderName}>{item.sender}</Text>
              <Text style={styles.messageTime}>{item.time}</Text>
            </View>
            <Text 
              style={[styles.messageText, item.unread && styles.unreadText]}
              numberOfLines={1}
            >
              {item.message}
            </Text>
          </View>
        </Card.Content>
      </Card>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Messages</Text>
      <FlatList
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
      />
      <TouchableOpacity 
        style={styles.newMessageButton}
        onPress={() => Alert.alert('Coming Soon', 'New message feature will be available soon!')}
      >
        <Icon name="edit" size={20} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 16,
  },
  listContainer: {
    paddingBottom: 80,
  },
  messageCard: {
    marginBottom: 12,
    elevation: 2,
    borderRadius: 8,
  },
  unreadCard: {
    backgroundColor: '#E9ECEF',
  },
  messageContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 12,
    backgroundColor: '#1D3557',
  },
  messageDetails: {
    flex: 1,
  },
  messageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1D3557',
  },
  messageTime: {
    fontSize: 12,
    color: '#6c757d',
  },
  messageText: {
    fontSize: 14,
    color: '#666',
  },
  unreadText: {
    color: '#1D3557',
    fontWeight: '500',
  },
  newMessageButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1D3557',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
  },
});

export default MessagesScreen; 