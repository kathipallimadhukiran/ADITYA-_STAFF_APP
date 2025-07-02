import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Share,
} from 'react-native';
import { getAuth, db } from '../../services/Firebase/firebaseConfig';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import AdminNoticesScreen from './AdminNoticesScreen';
import NoticesList from './NoticesList';

const NoticesScreen = () => {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState(null);

  const auth = getAuth();
  const currentUser = auth.currentUser;

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const userDoc = await db
          .collection('users')
          .doc(currentUser?.email?.toLowerCase())
          .get();
        
        if (userDoc.exists) {
          const userData = userDoc.data();
          setUserRole(userData.role || userData.accessLevel || 'student');
        }
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole('student'); // Default to student role
      }
    };

    if (currentUser?.email) {
      fetchUserRole();
    }
  }, [currentUser]);

  useEffect(() => {
    if (!userRole) return;

    // Subscribe to notices collection
    const q = query(
      collection(db, 'notices'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const noticesList = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Filter notices based on user role and target audience
        if (
          data.targetAudience === 'all' ||
          (data.targetAudience === 'staff' && (userRole === 'staff' || userRole === 'admin')) ||
          (data.targetAudience === 'students' && userRole === 'student') ||
          userRole === 'admin'
        ) {
          noticesList.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || new Date(),
          });
        }
      });
      setNotices(noticesList);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [userRole]);

  const handleShare = async (notice) => {
    try {
      await Share.share({
        message: `${notice.title}\n\n${notice.description}${notice.imageUrl ? '\n\nImage: ' + notice.imageUrl : ''}`,
        title: notice.title,
      });
    } catch (error) {
      console.error('Error sharing notice:', error);
    }
  };

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // The onSnapshot listener will automatically update the notices
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  if (loading || !userRole) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1D3557" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NoticesList
        notices={notices}
        userRole={userRole}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onShare={handleShare}
      />
      {userRole === 'admin' && (
        <AdminNoticesScreen onNoticeAdded={onRefresh} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    position: 'relative',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default NoticesScreen; 