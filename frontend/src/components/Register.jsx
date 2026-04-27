import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import './Login.css';

const Register = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    phone: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await authAPI.register({
        ...formData,
        email: formData.email.trim().toLowerCase()
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
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
          Join Echo today and help make your community better. Report civic issues 
          with GPS precision and track their resolution in real-time.
        </p>
        <div className="features">
          <div className="feature">
            <span>Quick & Easy Registration</span>
          </div>
          <div className="feature">
            <span>Secure & Private</span>
          </div>
          <div className="feature">
            <span>Mobile Friendly</span>
          </div>
        </div>
      </div>
      
      <div className="login-right">
        <div className="login-box">
          <h2>Create Account</h2>
          <p className="subtitle">Register as a citizen to get started</p>
          
          {success ? (
            <div className="success">
              Registration successful! Redirecting to login...
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  placeholder="Enter your full name"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="input-group">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>
              
              <div className="input-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  name="phone"
                  placeholder="Enter your phone number"
                  value={formData.phone}
                  onChange={handleChange}
                />
              </div>
              
              <div className="input-group">
                <label>Password</label>
                <input
                  type="password"
                  name="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
              </div>
              
              {error && <div className="error">{error}</div>}
              
              <button type="submit" className="login-btn" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}
          
          <div className="divider">OR</div>
          
          <p className="register-link">
            Already have an account? <a href="/login">Sign In</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Register;
