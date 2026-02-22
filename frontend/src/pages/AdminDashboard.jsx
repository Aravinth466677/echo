import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { adminAPI } from '../services/api';
import './Dashboard.css';

const AdminDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [analytics, setAnalytics] = useState(null);
  const [authorities, setAuthorities] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    wardId: 1,
    department: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [analyticsRes, authoritiesRes] = await Promise.all([
        adminAPI.getAnalytics(),
        adminAPI.getAuthorities()
      ]);
      setAnalytics(analyticsRes.data);
      setAuthorities(authoritiesRes.data.authorities);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const handleCreateAuthority = async (e) => {
    e.preventDefault();
    try {
      await adminAPI.createAuthority(formData);
      alert('Authority created successfully');
      setShowCreateForm(false);
      setFormData({ email: '', password: '', fullName: '', wardId: 1, department: '' });
      loadData();
    } catch (error) {
      alert('Failed to create authority');
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Echo - Admin Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.fullName}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {analytics && (
          <section className="complaints-section">
            <h2>System Analytics</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>{analytics.stats.pending_issues}</h3>
                <p>Pending Issues</p>
              </div>
              <div className="stat-card">
                <h3>{analytics.stats.verified_issues}</h3>
                <p>Verified Issues</p>
              </div>
              <div className="stat-card">
                <h3>{analytics.stats.in_progress_issues}</h3>
                <p>In Progress</p>
              </div>
              <div className="stat-card">
                <h3>{analytics.stats.resolved_issues}</h3>
                <p>Resolved</p>
              </div>
              <div className="stat-card">
                <h3>{analytics.stats.today_complaints}</h3>
                <p>Today's Complaints</p>
              </div>
              <div className="stat-card">
                <h3>{analytics.stats.total_citizens}</h3>
                <p>Total Citizens</p>
              </div>
            </div>

            <h3>Category Statistics</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Issues</th>
                  <th>Total Echoes</th>
                </tr>
              </thead>
              <tbody>
                {analytics.categoryStats.map((cat) => (
                  <tr key={cat.name}>
                    <td>{cat.name}</td>
                    <td>{cat.issue_count}</td>
                    <td>{cat.total_echoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <section className="complaints-section">
          <h2>Authorities</h2>
          <button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : '+ Create Authority'}
          </button>

          {showCreateForm && (
            <form onSubmit={handleCreateAuthority} className="create-form">
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Full Name"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
              <input
                type="number"
                placeholder="Ward ID"
                value={formData.wardId}
                onChange={(e) => setFormData({ ...formData, wardId: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Department"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                required
              />
              <button type="submit">Create</button>
            </form>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Ward</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {authorities.map((auth) => (
                <tr key={auth.id}>
                  <td>{auth.full_name}</td>
                  <td>{auth.email}</td>
                  <td>{auth.ward_id}</td>
                  <td>{auth.department}</td>
                  <td>{auth.is_active ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};

export default AdminDashboard;
