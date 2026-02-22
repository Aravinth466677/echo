import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { authAPI } from '../services/api';
import './Login.css';

const Login = () => {
  const [role, setRole] = useState('citizen');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await authAPI.login({ email, password });
      
      if (response.data.user.role !== role) {
        setError(`This account is not registered as ${role}`);
        setLoading(false);
        return;
      }
      
      login(response.data.user, response.data.token);

      if (response.data.user.role === 'citizen') {
        navigate('/citizen/dashboard');
      } else if (response.data.user.role === 'authority') {
        navigate('/authority/dashboard');
      } else if (response.data.user.role === 'admin') {
        navigate('/admin/dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="brand">
          <h1>Echo</h1>
        </div>
        <p className="tagline">Geo-enabled civic complaint platform</p>
        <p className="description">
          Report civic issues with GPS precision. Track progress in real-time. 
          Make your community better, one report at a time.
        </p>
        <div className="features">
          <div className="feature">
            <span>Photo/Video Evidence</span>
          </div>
          <div className="feature">
            <span>GPS Location Tracking</span>
          </div>
          <div className="feature">
            <span>Real-time Status Updates</span>
          </div>
        </div>
      </div>
      
      <div className="login-right">
        <div className="login-box">
          <h2>Welcome Back</h2>
          <p className="subtitle">Sign in to continue to Echo</p>
          
          <div className="role-selector">
            <button
              type="button"
              className={`role-btn ${role === 'citizen' ? 'active' : ''}`}
              onClick={() => setRole('citizen')}
            >
              Citizen
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'authority' ? 'active' : ''}`}
              onClick={() => setRole('authority')}
            >
              Authority
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'admin' ? 'active' : ''}`}
              onClick={() => setRole('admin')}
            >
              Admin
            </button>
          </div>
          
          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>Email Address</label>
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            
            <div className="input-group">
              <label>Password</label>
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            
            {error && <div className="error">{error}</div>}
            
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          {role === 'citizen' && (
            <>
              <div className="divider">OR</div>
              <p className="register-link">
                Don't have an account? <a href="/register">Register as Citizen</a>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
