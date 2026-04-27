/**
 * NOTIFICATION BELL COMPONENT
 * Complete notification UI with bell icon, badge, and dropdown
 */

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useNotifications from '../hooks/useNotifications';
import './NotificationBellFixed.css';

const NotificationBell = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const dropdownRef = useRef(null);
    const navigate = useNavigate();
    const bellIcon = String.fromCodePoint(0x1F514);
    const refreshIcon = String.fromCodePoint(0x1F504);
    const emptyIcon = String.fromCodePoint(0x1F4ED);

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

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleNotificationClick = async (notification) => {
        try {
            if (!notification.is_read) {
                await markAsRead(notification.id);
            }

            if (notification.complaint_id) {
                navigate('/citizen/dashboard');
            }

            setIsOpen(false);
        } catch (notificationError) {
            console.error('Error handling notification click:', notificationError);
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
        } catch (notificationError) {
            console.error('Error marking all as read:', notificationError);
        }
    };

    const handleDeleteNotification = async (event, notificationId) => {
        event.stopPropagation();

        try {
            await deleteNotification(notificationId);
        } catch (notificationError) {
            console.error('Error deleting notification:', notificationError);
        }
    };

    const displayedNotifications = showAll
        ? notifications
        : notifications.slice(0, 10);

    return (
        <div className="notification-bell" ref={dropdownRef}>
            <button
                className="notification-bell-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label={`Notifications (${unreadCount} unread)`}
                type="button"
            >
                <span className="notification-bell-icon">{bellIcon}</span>

                {unreadCount > 0 && (
                    <span className="notification-badge">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="notification-dropdown">
                    <div className="notification-header">
                        <h3>Notifications</h3>
                        <div className="notification-actions">
                            <button
                                className="refresh-button"
                                onClick={refresh}
                                disabled={loading}
                                title="Refresh"
                                type="button"
                            >
                                <span className="refresh-icon">{refreshIcon}</span>
                            </button>
                            {unreadCount > 0 && (
                                <button
                                    className="mark-all-read-button"
                                    onClick={handleMarkAllAsRead}
                                    title="Mark all as read"
                                    type="button"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                    </div>

                    {loading && (
                        <div className="notification-loading">
                            <div className="loading-spinner"></div>
                            <span>Loading notifications...</span>
                        </div>
                    )}

                    {error && (
                        <div className="notification-error">
                            <span>Error loading notifications: {error}</span>
                            <button onClick={refresh} type="button">Retry</button>
                        </div>
                    )}

                    {!loading && !error && (
                        <div className="notification-list">
                            {displayedNotifications.length === 0 ? (
                                <div className="no-notifications">
                                    <span className="no-notifications-icon">{emptyIcon}</span>
                                    <p>No notifications</p>
                                </div>
                            ) : (
                                displayedNotifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                                        onClick={() => handleNotificationClick(notification)}
                                    >
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

                                        <button
                                            className="notification-delete"
                                            onClick={(event) => handleDeleteNotification(event, notification.id)}
                                            title="Delete notification"
                                            type="button"
                                        >
                                            <span>&times;</span>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {!loading && !error && notifications.length > 0 && (
                        <div className="notification-footer">
                            {notifications.length > 10 && !showAll && (
                                <button
                                    className="show-all-button"
                                    onClick={() => setShowAll(true)}
                                    type="button"
                                >
                                    Show all {notifications.length} notifications
                                </button>
                            )}
                            {showAll && (
                                <button
                                    className="show-less-button"
                                    onClick={() => setShowAll(false)}
                                    type="button"
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
