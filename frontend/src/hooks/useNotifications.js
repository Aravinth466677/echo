/**
 * NOTIFICATIONS HOOK
 * Custom React hook for managing notifications with polling
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { buildApiUrl } from '../services/api.js';
import { clearStoredAuth, getStoredToken, notifyAuthLogout } from '../utils/authStorage.js';

const normalizeNotificationError = (error) => {
    if (!error) {
        return 'Unable to load notifications right now.';
    }

    if (error.message === 'HTTP 404') {
        return 'Notifications are not available yet. Restart the backend after enabling the notifications route.';
    }

    if (
        error.message === 'Token expired' ||
        error.message === 'Invalid token' ||
        error.message === 'No token provided' ||
        error.message === 'No authentication token found' ||
        error.message === 'HTTP 401'
    ) {
        return 'Your session expired. Please sign in again.';
    }

    return error.message || 'Unable to load notifications right now.';
};

const useNotifications = (pollingInterval = 60000) => { // Poll every 60 seconds
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const intervalRef = useRef(null);
    const mountedRef = useRef(true);
    
    // API call helper
    const apiCall = async (url, options = {}) => {
        const token = getStoredToken();
        if (!token) {
            throw new Error('No authentication token found');
        }
        
        const response = await fetch(buildApiUrl(url), {
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMessage = errorData.error || `HTTP ${response.status}`;

            if (
                response.status === 401 &&
                ['token expired', 'invalid token', 'no token provided'].includes(String(errorMessage).toLowerCase())
            ) {
                clearStoredAuth();
                notifyAuthLogout();
            }

            throw new Error(errorMessage);
        }
        
        return response.json();
    };
    
    // Fetch notifications
    const fetchNotifications = useCallback(async (options = {}) => {
        try {
            setLoading(true);
            setError(null);
            
            const { limit = 50, unread_only = false } = options;
            const queryParams = new URLSearchParams({
                limit: limit.toString(),
                ...(unread_only && { unread_only: 'true' })
            });
            
            const data = await apiCall(`/notifications?${queryParams}`);
            
            if (mountedRef.current) {
                setNotifications(data.notifications || []);
                setUnreadCount(data.unread_count || 0);
            }
            
            return data;
            
        } catch (err) {
            console.error('Error fetching notifications:', err);
            if (mountedRef.current) {
                setNotifications([]);
                setUnreadCount(0);
                setError(normalizeNotificationError(err));
            }
            return {
                notifications: [],
                unread_count: 0,
                error: normalizeNotificationError(err)
            };
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, []);
    
    // Fetch unread count only
    const fetchUnreadCount = useCallback(async () => {
        try {
            const data = await apiCall('/notifications/unread-count');
            if (mountedRef.current) {
                setUnreadCount(data.unread_count || 0);
            }
            return data.unread_count;
        } catch (err) {
            console.error('Error fetching unread count:', err);
            if (mountedRef.current && err.message === 'HTTP 404') {
                setUnreadCount(0);
                setError(normalizeNotificationError(err));
            }
            return unreadCount; // Return current count on error
        }
    }, [unreadCount]);
    
    // Mark notification as read
    const markAsRead = useCallback(async (notificationId) => {
        try {
            await apiCall(`/notifications/${notificationId}/read`, {
                method: 'PATCH'
            });
            
            if (mountedRef.current) {
                // Update local state
                setNotifications(prev => 
                    prev.map(notification => 
                        notification.id === notificationId 
                            ? { ...notification, is_read: true }
                            : notification
                    )
                );
                
                // Decrease unread count
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
            
        } catch (err) {
            console.error('Error marking notification as read:', err);
            throw err;
        }
    }, []);
    
    // Mark all notifications as read
    const markAllAsRead = useCallback(async () => {
        try {
            const data = await apiCall('/notifications/read-all', {
                method: 'PATCH'
            });
            
            if (mountedRef.current) {
                // Update local state
                setNotifications(prev => 
                    prev.map(notification => ({ ...notification, is_read: true }))
                );
                setUnreadCount(0);
            }
            
            return data;
            
        } catch (err) {
            console.error('Error marking all notifications as read:', err);
            throw err;
        }
    }, []);
    
    // Delete notification
    const deleteNotification = useCallback(async (notificationId) => {
        try {
            await apiCall(`/notifications/${notificationId}`, {
                method: 'DELETE'
            });
            
            if (mountedRef.current) {
                // Remove from local state
                const notification = notifications.find(n => n.id === notificationId);
                setNotifications(prev => prev.filter(n => n.id !== notificationId));
                
                // Decrease unread count if it was unread
                if (notification && !notification.is_read) {
                    setUnreadCount(prev => Math.max(0, prev - 1));
                }
            }
            
        } catch (err) {
            console.error('Error deleting notification:', err);
            throw err;
        }
    }, [notifications]);
    
    // Start polling
    const startPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        
        intervalRef.current = setInterval(() => {
            if (mountedRef.current) {
                fetchUnreadCount(); // Only fetch count for polling to reduce load
            }
        }, pollingInterval);
    }, [pollingInterval, fetchUnreadCount]);
    
    // Stop polling
    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);
    
    // Refresh notifications
    const refresh = useCallback(() => {
        return fetchNotifications().catch((err) => ({
            notifications: [],
            unread_count: 0,
            error: normalizeNotificationError(err)
        }));
    }, [fetchNotifications]);
    
    // Initialize and cleanup
    useEffect(() => {
        mountedRef.current = true;
        
        // Initial fetch
        fetchNotifications();
        
        // Start polling
        startPolling();
        
        // Cleanup
        return () => {
            mountedRef.current = false;
            stopPolling();
        };
    }, [fetchNotifications, startPolling, stopPolling]);
    
    // Handle visibility change (pause polling when tab is hidden)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                startPolling();
                fetchUnreadCount(); // Quick update when tab becomes visible
            }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [startPolling, stopPolling, fetchUnreadCount]);
    
    return {
        notifications,
        unreadCount,
        loading,
        error,
        fetchNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh,
        startPolling,
        stopPolling
    };
};

export default useNotifications;
