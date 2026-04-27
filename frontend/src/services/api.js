import axios from 'axios';
import { clearStoredAuth, getStoredToken, notifyAuthLogout } from '../utils/authStorage.js';

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const API = trimTrailingSlash(process.env.REACT_APP_API_URL || '');

if (!API) {
  console.warn('REACT_APP_API_URL is not set. Configure it before running the frontend.');
}

export { API };
export const API_BASE_URL = API;
export const API_ORIGIN = API;
export const buildApiUrl = (path = '') => `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

// Add token to all requests
api.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const errorMessage = String(error.response?.data?.error || '').toLowerCase();
    const requestUrl = error.config?.url || '';
    const hasStoredToken = Boolean(getStoredToken());
    const isAuthRequest = requestUrl.includes('/auth/login') || requestUrl.includes('/auth/register');
    const isTokenFailure =
      errorMessage.includes('token') ||
      errorMessage.includes('jwt') ||
      errorMessage.includes('no token');

    if (status === 401 && hasStoredToken && !isAuthRequest && isTokenFailure) {
      console.error('Auth token rejected - clearing current tab session');
      clearStoredAuth();
      notifyAuthLogout();
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  register: (data) => api.post('/api/auth/register', data),
  login: (data) => api.post('/api/auth/login', data),
  authorityLogin: (data) => api.post('/api/auth/authority-login', data),
};

export const complaintAPI = {
  submit: (formData) => api.post('/api/complaints/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyComplaints: () => api.get('/api/complaints/my-complaints'),
  getRoutingHistory: (complaintId) => api.get(`/api/complaints/routing-history/${complaintId}`),
  getAreaIssues: (lat, lon, radius) => api.get('/api/complaints/area-issues', {
    params: { latitude: lat, longitude: lon, radius }
  }),
  getCategories: () => api.get('/api/complaints/categories'),
  // Remote reporting endpoints
  validateRemoteReport: (data) => api.post('/api/complaints/validate-remote', data),
  getUserReportingStats: () => api.get('/api/complaints/reporting-stats'),
  getJustificationOptions: () => api.get('/api/complaints/justification-options'),
  // Secure contact endpoints (Authority/Admin only)
  getComplaintDetails: (complaintId) => api.get(`/api/complaints/${complaintId}/details`),
  getComplaintContact: (complaintId) => api.get(`/api/complaints/${complaintId}/contact`)
};

export const authorityAPI = {
  getVerificationQueue: () => api.get('/api/authority/verification-queue'),
  getActiveIssues: () => api.get('/api/authority/active-issues'),
  getIssueDetails: (issueId) => api.get(`/api/authority/issue/${issueId}`),
  verifyIssue: (issueId, action) => api.post(`/api/authority/issue/${issueId}/verify`, { action }),
  updateIssueStatus: (issueId, status, resolutionProofUrl) => 
    api.post(`/api/authority/issue/${issueId}/status`, { status, resolutionProofUrl }),
  updateIssueLocation: (issueId, locationData) =>
    api.post(`/api/authority/issue/${issueId}/location`, locationData),
};

export const analyticsAPI = {
  getHeatmapData: (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.categoryId && filters.categoryId !== 'all') {
      params.append('categoryId', filters.categoryId);
    }
    if (filters.days) {
      params.append('days', filters.days);
    }
    if (filters.status && filters.status !== 'all') {
      params.append('status', filters.status);
    }
    if (filters.zoom) {
      params.append('zoom', filters.zoom);
    }
    const queryString = params.toString();
    return api.get(`/api/analytics/heatmap${queryString ? '?' + queryString : ''}`);
  },
  getSummary: () => api.get('/api/analytics/summary'),
  getCategories: () => api.get('/api/analytics/categories'),
};

export const adminAPI = {
  getAnalytics: () => api.get('/api/admin/analytics'),
  createAuthority: (data) => api.post('/api/admin/authorities', data),
  getAuthorities: () => api.get('/api/admin/authorities'),
  deleteAuthority: (id) => api.delete(`/api/admin/authorities/${id}`),
  getSLABreaches: () => api.get('/api/admin/sla-breaches'),
  getCategories: () => api.get('/api/complaints/categories'),
};

export const jurisdictionAPI = {
  create: (data) => api.post('/api/jurisdictions', data),
  getAll: () => api.get('/api/jurisdictions'),
  delete: (id) => api.delete(`/api/jurisdictions/${id}`),
  detect: (data) => api.post('/api/jurisdiction-detection/detect', data),
  test: (data) => api.post('/api/jurisdiction-detection/test', data),
};

export default api;
