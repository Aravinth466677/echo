/**
 * NOTIFICATION BELL COMPONENT
 * Complete notification UI with bell icon, badge, and dropdown
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';
import './NotificationBell.css';

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();
    
    const {
        notifications,
        unreadCount,
        loading,
        error,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh
    } = useNotifications();
    
    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    // Handle notification click
    const handleNotificationClick = async (notification) => {
        try {
            // Mark as read if unread
            if (!notification.is_read) {
                await markAsRead(notification.id);
            }
            
            // Navigate to complaint if complaint_id exists
            if (notification.complaint_id) {
                navigate(`/complaints/${notification.complaint_id}`);
            }
            
            // Close dropdown
            setIsOpen(false);
            
        } catch (error) {
            console.error('Error handling notification click:', error);
        }
    };
    
    // Handle mark all as read
    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
        } catch (error) {
            console.error('Error marking all as read:', error);
        }
    };
    
    // Handle delete notification
    const handleDeleteNotification = async (e, notificationId) => {
        e.stopPropagation(); // Prevent notification click
        try {
            await deleteNotification(notificationId);
        } catch (error) {
            console.error('Error deleting notification:', error);
        }
    };
    
    // Filter notifications based on showAll
    const displayedNotifications = showAll 
        ? notifications 
        : notifications.slice(0, 10);
    
    const unreadNotifications = notifications.filter(n => !n.is_read);
    
    return (
        <div className="notification-bell" ref={dropdownRef}>
            {/* Bell Icon with Badge */}
            <button 
                className="notification-bell-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={`Notifications (${unreadCount} unread)`}
            >
                <svg 
                    className="notification-bell-icon" 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                >
                    <path 
                        strokeLinecap="round" 
                        strokeLinejoin="round" 
                        strokeWidth={2} 
                        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" 
                    />
                </svg>
                
                {/* Unread Badge */}
                {unreadCount > 0 && (
                    <span className="notification-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>
            
            {/* Dropdown */}
            {isOpen && (
                <div className="notification-dropdown">
                    {/* Header */}
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        <div className="notification-actions">
                            <button 
                                className="refresh-button"
                                onClick={refresh}
                                disabled={loading}
                                title="Refresh"
                            >
                                <svg className="refresh-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                            {unreadCount > 0 && (
                                <button 
                                    className="mark-all-read-button"
                                    onClick={handleMarkAllAsRead}
                                    title="Mark all as read"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>
                    
                    {/* Loading State */}
                    {loading && (
                        <div className="notification-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading notifications...</span>
                        </div>
                    )}
                    
                    {/* Error State */}
                    {error && (
                        <div className="notification-error">
                            <span>Error loading notifications: {error}</span>
                            <button onClick={refresh}>Retry</button>
                        </div>
                    )}
                    
                    {/* Notifications List */}
                    {!loading && !error && (
                        <div className="notification-list">
                            {displayedNotifications.length === 0 ? (
                                <div className="no-notifications">
                                    <svg className="no-notifications-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                    </svg>
                                    <p>No notifications</p>
                                </div>
                            ) : (
                                displayedNotifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
                                        {/* Notification Content */}
                                        <div className="notification-content">
                                            <div className="notification-title">
                                                {notification.title}
                                                {!notification.is_read && <span className="unread-dot"></span>}
                                            </div>
                                            <div className="notification-message">
                                                {notification.message}
                                            </div>
                                            <div className="notification-meta">
                                                <span className="notification-time">
                                                    {notification.time_ago}
                                                </span>
                                                {notification.complaint_id && (
                                                    <span className="notification-complaint">
                                                        Complaint #{notification.complaint_id}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* Delete Button */}
                                        <button
                                            className="notification-delete"
                                            onClick={(e) => handleDeleteNotification(e, notification.id)}
                                            title="Delete notification"
                                        >
                                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                    
                    {/* Footer */}
                    {!loading && !error && notifications.length > 0 && (
                        <div className="notification-footer">
                            {notifications.length > 10 && !showAll && (
                                <button 
                                    className="show-all-button"
                                    onClick={() => setShowAll(true)}
                                >
                                    Show all {notifications.length} notifications
                                </button>
                            )}
                            {showAll && (
                                <button 
                                    className="show-less-button"
                                    onClick={() => setShowAll(false)}
                                >
                                    Show less
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default NotificationBell;