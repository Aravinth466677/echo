import React, { useState, useEffect, useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { adminAPI, jurisdictionAPI } from '../services/api';
import JurisdictionMap from '../components/JurisdictionMap.jsx';
import JurisdictionTester from '../components/JurisdictionTester.jsx';
import './Dashboard.css';
import './AuthorityForm.css';
import '../components/PasswordField.css';

const AdminDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [analytics, setAnalytics] = useState(null);
  const [authorities, setAuthorities] = useState([]);
  const [jurisdictions, setJurisdictions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('analytics');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    wardId: '',
    categoryId: '',
    jurisdictionId: '',
    authorityLevel: 'JURISDICTION'
  });

  // Debug: Log user object
  useEffect(() => {
    console.log('Current user:', user);
    console.log('User role:', user?.role);
  }, [user]);

  useEffect(() => {
    console.log('Component mounted, loading data...');
    loadData();
  }, []);

  useEffect(() => {
    console.log('State updated:', { 
      jurisdictions: jurisdictions.length, 
      categories: categories.length,
      authorities: authorities.length 
    });
  }, [jurisdictions, categories, authorities]);

  const loadData = async () => {
    try {
      console.log('Starting data load...');
      
      const analyticsRes = await adminAPI.getAnalytics();
      console.log('Analytics loaded:', analyticsRes.data);
      setAnalytics(analyticsRes.data);
      
      const authoritiesRes = await adminAPI.getAuthorities();
      console.log('Authorities loaded:', authoritiesRes.data);
      setAuthorities(authoritiesRes.data.authorities);
      
      const jurisdictionsRes = await jurisdictionAPI.getAll();
      console.log('Jurisdictions loaded:', jurisdictionsRes.data);
      setJurisdictions(jurisdictionsRes.data.jurisdictions || []);
      
      const categoriesRes = await adminAPI.getCategories();
      console.log('Categories loaded:', categoriesRes.data);
      setCategories(categoriesRes.data.categories || []);
      
    } catch (error) {
      console.error('Failed to load data:', error);
      console.error('Error details:', error.response?.data);
    }
  };

  const handleDeleteAuthority = async (authorityId, authorityEmail) => {
    if (!window.confirm(`Delete authority: ${authorityEmail}?\n\nThis will remove the user and all their assignments.`)) {
      return;
    }

    try {
      console.log('Deleting authority ID:', authorityId);
      await adminAPI.deleteAuthority(authorityId);
      alert('Authority deleted successfully!');
      
      // Reload authorities
      const authoritiesRes = await adminAPI.getAuthorities();
      setAuthorities(authoritiesRes.data.authorities);
    } catch (error) {
      console.error('Delete authority error:', error);
      console.error('Error response:', error.response?.data);
      const errorMsg = error.response?.data?.error || 'Failed to delete authority';
      const errorDetails = error.response?.data?.details || '';
      alert(`Error: ${errorMsg}${errorDetails ? '\n\nDetails: ' + errorDetails : ''}`);
    }
  };

  const handleCreateAuthority = async (e) => {
    e.preventDefault();
    
    const category = categories.find(c => c.id === parseInt(formData.categoryId));
    const jurisdiction = jurisdictions.find(j => j.id === parseInt(formData.jurisdictionId));
    
    if (!category || !jurisdiction) {
      alert('Please select both category and jurisdiction');
      return;
    }
    
    // Only create JURISDICTION authorities
    const fullName = `${jurisdiction.name} ${category.name} Officer`;
    const normalizeEmailPart = (value) =>
      value.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
    const emailPrefix = `${normalizeEmailPart(category.name)}.${normalizeEmailPart(jurisdiction.name)}`;
    const email = (formData.email || `${emailPrefix}@echo.gov`).trim().toLowerCase();
    
    try {
      await adminAPI.createAuthority({
        email,
        password: formData.password,
        fullName,
        jurisdictionId: formData.jurisdictionId,
        categoryId: formData.categoryId,
        authorityLevel: 'JURISDICTION',
        department: `${category.name} - ${jurisdiction.name}`
      });
      
      alert(`Jurisdiction Authority created successfully!\nName: ${fullName}\nEmail: ${email}`);
      setShowCreateForm(false);
      setFormData({ email: '', password: '', wardId: '', categoryId: '', jurisdictionId: '', authorityLevel: 'JURISDICTION' });
      
      const authoritiesRes = await adminAPI.getAuthorities();
      setAuthorities(authoritiesRes.data.authorities);
    } catch (error) {
      console.error('Create authority error:', error);
      alert(error.response?.data?.error || 'Failed to create authority');
    }
  };

  const copyTextToClipboard = async (text) => {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(textArea);
    }
  };

  const handleCopyEmail = async (email) => {
    try {
      const copied = await copyTextToClipboard(email);

      if (!copied) {
        throw new Error('Copy command was unsuccessful');
      }
    } catch (error) {
      console.error('Failed to copy email:', error);
      alert(`Unable to copy automatically. Email: ${email}`);
    }
  };

  const getAuthorityScopeLabel = (auth) => {
    if (auth.authority_level === 'SUPER_ADMIN') {
      return 'System-wide';
    }

    if (auth.authority_level === 'DEPARTMENT') {
      return 'All jurisdictions';
    }

    if (auth.authority_level === 'JURISDICTION') {
      return auth.jurisdiction_name || 'Missing jurisdiction';
    }

    return auth.jurisdiction_name || 'N/A';
  };

  // Check if user is admin
  const isAdmin = user?.role === 'admin';

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Echo - Admin Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.fullName} ({user?.role})</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      {!isAdmin && (
        <div style={{ padding: '20px', background: '#fee', color: '#c33', margin: '20px', borderRadius: '8px' }}>
          <strong>Access Denied:</strong> This page is only accessible to admin users. You are logged in as: {user?.role}
        </div>
      )}

      {isAdmin && (
      <div className="dashboard-content">
        <div className="tab-buttons">
          <button 
            className={activeTab === 'analytics' ? 'active' : ''}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
          <button 
            className={activeTab === 'authorities' ? 'active' : ''}
            onClick={() => setActiveTab('authorities')}
          >
            Authorities
          </button>
          <button 
            className={activeTab === 'jurisdictions' ? 'active' : ''}
            onClick={() => setActiveTab('jurisdictions')}
          >
            Jurisdictions
          </button>
        </div>

        {activeTab === 'analytics' && analytics && (
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

            {analytics.slaStats && (
              <>
                <h3>SLA Performance</h3>
                <div className="stats-grid">
                  <div className="stat-card">
                    <h3 style={{ color: '#dc2626' }}>{analytics.slaStats.breached_issues}</h3>
                    <p>SLA Breached</p>
                  </div>
                  <div className="stat-card">
                    <h3 style={{ color: '#f59e0b' }}>{analytics.slaStats.critical_issues}</h3>
                    <p>Critical ({'<' } 2h)</p>
                  </div>
                  <div className="stat-card">
                    <h3 style={{ color: '#10b981' }}>{analytics.slaStats.sla_compliance_percentage}%</h3>
                    <p>SLA Compliance</p>
                  </div>
                  <div className="stat-card">
                    <h3>{analytics.slaStats.avg_resolution_hours}h</h3>
                    <p>Avg Resolution Time</p>
                  </div>
                  <div className="stat-card">
                    <h3>{analytics.slaStats.total_active_issues}</h3>
                    <p>Active Issues</p>
                  </div>
                  <div className="stat-card">
                    <h3>{analytics.slaStats.resolved_within_sla}/{analytics.slaStats.total_resolved}</h3>
                    <p>Resolved Within SLA</p>
                  </div>
                </div>
              </>
            )}

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
                {analytics.categoryStats.map((cat, index) => (
                  <tr key={`${cat.name}-${index}`}>
                    <td>{cat.name}</td>
                    <td>{cat.issue_count}</td>
                    <td>{cat.total_echoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === 'authorities' && (
          <section className="complaints-section">
            <h2>Authorities</h2>
            <button className="btn-primary" onClick={() => setShowCreateForm(true)} style={{ marginBottom: '20px', width: 'auto', padding: '12px 24px' }}>
              + Create Authority
            </button>

          {showCreateForm && (
            <div className="authority-form-modal" onClick={() => setShowCreateForm(false)}>
              <div className="authority-form-container" onClick={(e) => e.stopPropagation()}>
                <div className="authority-form-header">
                  <h3>Create Authority</h3>
                  <button className="close-btn" onClick={() => setShowCreateForm(false)}>×</button>
                </div>
                
                <form onSubmit={handleCreateAuthority}>
                  <div className="authority-form-body">
                    <div className="form-group">
                      <label>Authority Level *</label>
                      <select
                        value={formData.authorityLevel}
                        onChange={(e) => setFormData({ ...formData, authorityLevel: e.target.value, jurisdictionId: '' })}
                        required
                        disabled
                      >
                        <option value="JURISDICTION">JURISDICTION (Specific Area)</option>
                      </select>
                      <div className="hint">
                        Admin can only create JURISDICTION authorities for specific areas.<br/>
                        DEPARTMENT authorities are pre-created by system.
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Category (Department) *</label>
                      <select
                        value={formData.categoryId}
                        onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                        required
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                      <div className="hint">Department this authority will manage</div>
                    </div>

                    <div className="form-group">
                      <label>Jurisdiction (Area) *</label>
                      <select
                        value={formData.jurisdictionId}
                        onChange={(e) => setFormData({ ...formData, jurisdictionId: e.target.value })}
                        required
                      >
                        <option value="">Select Jurisdiction</option>
                        {jurisdictions.map(j => (
                          <option key={j.id} value={j.id}>{j.name}</option>
                        ))}
                      </select>
                      <div className="hint">
                        {jurisdictions.length === 0 ? 'No jurisdictions available. Create one in Jurisdictions tab first.' : 
                         `${jurisdictions.length} jurisdiction(s) available. This assigns the polygon area to the authority.`}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Email (Optional)</label>
                      <input
                        type="email"
                        placeholder="Auto-generated if left empty"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                      <div className="hint">Leave empty to auto-generate: category.jurisdiction@echo.gov</div>
                    </div>

                    <div className="form-group">
                      <label>Password *</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="Minimum 6 characters"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                          required
                          minLength="6"
                          style={{ 
                            paddingRight: '45px',
                            WebkitAppearance: 'none',
                            MozAppearance: 'textfield'
                          }}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex="-1"
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px'
                          }}
                        >
                          {showPassword ? '👁️' : '👁️‍🗨️'}
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Ward ID</label>
                      <input
                        type="number"
                        placeholder="Auto-derived from jurisdiction or enter manually"
                        value={formData.wardId}
                        onChange={(e) => setFormData({ ...formData, wardId: e.target.value })}
                        min="1"
                      />
                      <div className="hint">Administrative ward number (optional - can be auto-derived from jurisdiction)</div>
                    </div>

                    {formData.categoryId && formData.jurisdictionId && (
                      <div className="info-box" style={{ background: '#e8f5e9', borderColor: '#4caf50' }}>
                        <strong style={{ color: '#4caf50' }}>Preview:</strong><br/>
                        Name: {jurisdictions.find(j => j.id === parseInt(formData.jurisdictionId))?.name} {categories.find(c => c.id === parseInt(formData.categoryId))?.name} Officer<br/>
                        Area: Polygon boundary from {jurisdictions.find(j => j.id === parseInt(formData.jurisdictionId))?.name} jurisdiction
                      </div>
                    )}
                  </div>

                  <div className="form-actions">
                    <button type="button" className="btn-secondary" onClick={() => setShowCreateForm(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn-primary">
                      Create Authority
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Level</th>
                <th>Department</th>
                <th>Jurisdiction</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {authorities.map((auth) => (
                <tr key={auth.id}>
                  <td>{auth.full_name}</td>
                  <td>
                    {auth.email}
                    <button 
                      onClick={() => handleCopyEmail(auth.email)}
                      style={{ marginLeft: '8px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                      title="Copy email"
                    >
                      📋
                    </button>
                  </td>
                  <td>{auth.authority_level || 'N/A'}</td>
                  <td>{auth.department || 'N/A'}</td>
                  <td>{getAuthorityScopeLabel(auth)}</td>
                  <td>{auth.is_active ? 'Active' : 'Inactive'}</td>
                  <td>
                    <button 
                      onClick={() => alert(`Email: ${auth.email}\n\nNote: Password was set during creation. Contact admin if password reset needed.`)}
                      style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', marginRight: '8px' }}
                    >
                      View Info
                    </button>
                    <button 
                      onClick={() => handleDeleteAuthority(auth.id, auth.email)}
                      style={{ 
                        padding: '6px 12px', 
                        fontSize: '12px', 
                        cursor: 'pointer',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </section>
        )}

        {activeTab === 'jurisdictions' && (
          <section className="complaints-section">
            <h2>Jurisdiction Boundaries</h2>
            <JurisdictionTester />
            <JurisdictionMap />
          </section>
        )}
      </div>
      )}
    </div>
  );
};

export default AdminDashboard;
