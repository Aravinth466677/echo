import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import Register from './components/Register.jsx';
import CitizenDashboard from './pages/CitizenDashboard.jsx';
import ReportIssue from './pages/ReportIssue.jsx';
import AreaIssues from './pages/AreaIssues.jsx';
import AuthorityDashboard from './pages/AuthorityDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AnalyticsDashboard from './pages/AnalyticsDashboard.jsx';
import HeatmapDashboard from './pages/HeatmapDashboard.jsx';
import { normalizeRole } from './utils/auth.js';

const PrivateRoute = ({ children, allowedRoles }) => {
  const { user, isAuthReady } = React.useContext(AuthContext);
  const userRole = normalizeRole(user?.role);
  const normalizedAllowedRoles = allowedRoles?.map(normalizeRole);

  if (!isAuthReady) {
    return null;
  }
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (normalizedAllowedRoles && !normalizedAllowedRoles.includes(userRole)) {
    return <Navigate to="/login" />;
  }
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route
            path="/citizen/dashboard"
            element={
              <PrivateRoute allowedRoles={['citizen']}>
                <CitizenDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/citizen/report-issue"
            element={
              <PrivateRoute allowedRoles={['citizen']}>
                <ReportIssue />
              </PrivateRoute>
            }
          />
          <Route
            path="/citizen/area-issues"
            element={
              <PrivateRoute allowedRoles={['citizen']}>
                <AreaIssues />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/authority/dashboard"
            element={
              <PrivateRoute allowedRoles={['authority']}>
                <AuthorityDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/authority/analytics"
            element={
              <PrivateRoute allowedRoles={['authority', 'admin']}>
                <AnalyticsDashboard />
              </PrivateRoute>
            }
          />
          <Route
            path="/heatmap"
            element={
              <PrivateRoute allowedRoles={['authority', 'admin', 'citizen']}>
                <HeatmapDashboard />
              </PrivateRoute>
            }
          />
          
          <Route
            path="/admin/dashboard"
            element={
              <PrivateRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </PrivateRoute>
            }
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
