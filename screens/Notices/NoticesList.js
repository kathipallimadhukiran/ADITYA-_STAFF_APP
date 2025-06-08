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
} from 'react-native';
import { Card } from 'react-native-paper';
import Icon from 'react-native-vector-icons/FontAwesome5';

const NoticesList = ({
  notices,
  userRole,
  refreshing,
  onRefresh,
  onShare,
}) => {
  const renderNotice = ({ item }) => (
    <Card style={styles.noticeCard}>
      <Card.Content>
        <View style={styles.noticeHeader}>
          <View>
            <Text style={styles.noticeTitle}>{item.title}</Text>
            <Text style={styles.noticeMetadata}>
              {item.department} • {item.createdAt.toLocaleDateString()}
            </Text>
          </View>
          {(userRole === 'staff' || userRole === 'student') && (
            <TouchableOpacity onPress={() => onShare(item)}>
              <Icon name="share-alt" size={20} color="#1D3557" />
            </TouchableOpacity>
          )}
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
            item.targetAudience === 'staff' && styles.staffBadge,
            item.targetAudience === 'students' && styles.studentsBadge,
          ]}>
            {item.targetAudience.charAt(0).toUpperCase() + item.targetAudience.slice(1)}
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
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#E9ECEF',
    fontSize: 12,
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