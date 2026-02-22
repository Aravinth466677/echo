import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
};

export const complaintAPI = {
  submit: (formData) => api.post('/complaints/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyComplaints: () => api.get('/complaints/my-complaints'),
  getAreaIssues: (lat, lon, radius) => api.get('/complaints/area-issues', {
    params: { latitude: lat, longitude: lon, radius }
  }),
  getCategories: () => api.get('/complaints/categories'),
};

export const authorityAPI = {
  getVerificationQueue: () => api.get('/authority/verification-queue'),
  getActiveIssues: () => api.get('/authority/active-issues'),
  getIssueDetails: (issueId) => api.get(`/authority/issue/${issueId}`),
  verifyIssue: (issueId, action) => api.post(`/authority/issue/${issueId}/verify`, { action }),
  updateIssueStatus: (issueId, status, resolutionProofUrl) => 
    api.post(`/authority/issue/${issueId}/status`, { status, resolutionProofUrl }),
};

export const adminAPI = {
  getAnalytics: () => api.get('/admin/analytics'),
  createAuthority: (data) => api.post('/admin/authorities', data),
  getAuthorities: () => api.get('/admin/authorities'),
  getSLABreaches: () => api.get('/admin/sla-breaches'),
};

export default api;
