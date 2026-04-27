/**
 * EXAMPLE NAVBAR WITH NOTIFICATION BELL
 * Shows how to integrate the NotificationBell component
 */

import React from 'react';
import NotificationBell from './NotificationBellFixed';
import './ExampleNavbar.css';

const ExampleNavbar = () => {
    return (
        <nav className="example-navbar">
            <div className="navbar-left">
                <h1 className="navbar-logo">Echo</h1>
            </div>
            
            <div className="navbar-center">
                <ul className="navbar-menu">
                    <li><a href="/dashboard">Dashboard</a></li>
                    <li><a href="/complaints">My Complaints</a></li>
                    <li><a href="/report">Report Issue</a></li>
                </ul>
            </div>
            
            <div className="navbar-right">
                {/* Notification Bell Component */}
                <NotificationBell />
                
                <div className="user-menu">
                    <button className="user-button">
                        <span className="user-avatar">👤</span>
                        <span className="user-name">John Doe</span>
                    </button>
                </div>
            </div>
        </nav>
    );
};

export default ExampleNavbar;