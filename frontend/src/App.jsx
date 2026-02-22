import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext.jsx';
import Login from './components/Login.jsx';
import Register from './components/Register.jsx';
import CitizenDashboard from './pages/CitizenDashboard.jsx';
import ReportIssue from './pages/ReportIssue.jsx';
import AuthorityDashboard from './pages/AuthorityDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';

const PrivateRoute = ({ children, allowedRoles }) => {
  const { user } = React.useContext(AuthContext);
  
  if (!user) {
    return <Navigate to="/login" />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user.role)) {
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
            path="/authority/dashboard"
            element={
              <PrivateRoute allowedRoles={['authority']}>
                <AuthorityDashboard />
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
