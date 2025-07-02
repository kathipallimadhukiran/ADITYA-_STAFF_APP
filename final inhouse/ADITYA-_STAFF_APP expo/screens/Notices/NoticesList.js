import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Share,
  RefreshControl,
  Alert,
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../services/Firebase/firebaseConfig';

const NoticesList = ({
  notices,
  userRole,
  refreshing,
  onRefresh,
  onShare,
}) => {
  const handleDelete = async (noticeId) => {
    Alert.alert(
      'Delete Notice',
      'Are you sure you want to delete this notice?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'notices', noticeId));
              // The notice will be automatically removed from the list due to the Firestore listener
            } catch (error) {
              console.error('Error deleting notice:', error);
              Alert.alert('Error', 'Failed to delete notice');
            }
          }
        }
      ]
    );
  };

  const renderNotice = ({ item }) => (
    <Card style={styles.noticeCard}>
      <Card.Content>
        <View style={styles.noticeHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.noticeTitle}>{item.title}</Text>
            <Text style={styles.noticeMetadata}>
              {item.department} • {item.createdAt.toLocaleDateString()}
            </Text>
          </View>
          <View style={styles.actionButtons}>
            {(userRole === 'staff' || userRole === 'student') && (
              <TouchableOpacity 
                onPress={() => onShare(item)}
                style={styles.actionButton}
              >
                <Icon name="share-alt" size={20} color="#1D3557" />
              </TouchableOpacity>
            )}
            {userRole === 'admin' && (
              <TouchableOpacity 
                onPress={() => handleDelete(item.id)}
                style={[styles.actionButton, styles.deleteButton]}
              >
                <Icon name="trash" size={20} color="#dc3545" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        
        {item.imageUrl && (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.noticeImage}
            resizeMode="cover"
          />
        )}
        
        <Text style={styles.noticeDescription}>{item.description}</Text>
        
        <View style={styles.noticeFooter}>
          <Text style={styles.noticeAuthor}>
            Posted by: {item.createdBy?.name || 'Admin'}
          </Text>
          <Text style={[
            styles.audienceBadge,
            item.targetAudience === 'all' && styles.allBadge,
            item.targetAudience === 'staff' && styles.staffBadge,
            item.targetAudience === 'students' && styles.studentsBadge,
          ]}>
            {item.targetAudience === 'all' ? 'Everyone' : item.targetAudience.charAt(0).toUpperCase() + item.targetAudience.slice(1)}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <FlatList
      data={notices}
      renderItem={renderNotice}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.noticesList}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#1D3557']}
          tintColor="#1D3557"
        />
      }
      ListEmptyComponent={() => (
        <View style={styles.emptyState}>
          <Icon name="bell-slash" size={48} color="#ccc" />
          <Text style={styles.emptyStateText}>No notices available</Text>
        </View>
      )}
    />
  );
};

const styles = StyleSheet.create({
  noticesList: {
    padding: 16,
  },
  noticeCard: {
    marginBottom: 16,
    borderRadius: 8,
    elevation: 2,
  },
  noticeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: '#fff1f0',
    borderRadius: 4,
  },
  noticeTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1D3557',
    marginBottom: 4,
  },
  noticeMetadata: {
    fontSize: 12,
    color: '#6c757d',
  },
  noticeImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginVertical: 8,
  },
  noticeDescription: {
    fontSize: 14,
    color: '#212529',
    marginVertical: 8,
  },
  noticeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  noticeAuthor: {
    fontSize: 12,
    color: '#6c757d',
  },
  audienceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#E9ECEF',
    fontSize: 13,
    fontWeight: '600',
    color: '#1D3557',
  },
  allBadge: {
    backgroundColor: '#1D3557',
    color: '#fff',
  },
  staffBadge: {
    backgroundColor: '#457B9D',
    color: '#fff',
  },
  studentsBadge: {
    backgroundColor: '#2EC4B6',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyStateText: {
    marginTop: 8,
    fontSize: 16,
    color: '#6c757d',
  },
});

export default NoticesList; 