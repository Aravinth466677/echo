import axios from 'axios';
import { clearStoredAuth, getStoredToken, notifyAuthLogout } from '../utils/authStorage.js';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

const stripApiSuffix = (value = '') => value.replace(/\/api$/, '');

const isLocalHostname = (hostname = '') => LOCAL_HOSTNAMES.has(hostname.toLowerCase());

// Default to the local backend during development, but avoid baking localhost into public deployments.
const resolveApiBaseUrl = () => {
  const configuredApiUrl = trimTrailingSlash(process.env.REACT_APP_API_URL || '');
  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5000/api';
  }

  return isLocalHostname(window.location.hostname)
    ? 'http://localhost:5000/api'
    : `${window.location.origin}/api`;
};

const resolveApiOrigin = () => {
  const configuredApiUrl = trimTrailingSlash(process.env.REACT_APP_API_URL || '');
  if (configuredApiUrl) {
    return stripApiSuffix(configuredApiUrl);
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5000';
  }

  return isLocalHostname(window.location.hostname)
    ? 'http://localhost:5000'
    : window.location.origin;
};

export const API_BASE_URL = resolveApiBaseUrl();
export const API_ORIGIN = resolveApiOrigin();

const api = axios.create({
  baseURL: API_BASE_URL,
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
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  authorityLogin: (data) => api.post('/auth/authority-login', data),
};

export const complaintAPI = {
  submit: (formData) => api.post('/complaints/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getMyComplaints: () => api.get('/complaints/my-complaints'),
  getRoutingHistory: (complaintId) => api.get(`/complaints/routing-history/${complaintId}`),
  getAreaIssues: (lat, lon, radius) => api.get('/complaints/area-issues', {
    params: { latitude: lat, longitude: lon, radius }
  }),
  getCategories: () => api.get('/complaints/categories'),
  // Remote reporting endpoints
  validateRemoteReport: (data) => api.post('/complaints/validate-remote', data),
  getUserReportingStats: () => api.get('/complaints/reporting-stats'),
  getJustificationOptions: () => api.get('/complaints/justification-options'),
  // Secure contact endpoints (Authority/Admin only)
  getComplaintDetails: (complaintId) => api.get(`/complaints/${complaintId}/details`),
  getComplaintContact: (complaintId) => api.get(`/complaints/${complaintId}/contact`)
};

export const authorityAPI = {
  getVerificationQueue: () => api.get('/authority/verification-queue'),
  getActiveIssues: () => api.get('/authority/active-issues'),
  getIssueDetails: (issueId) => api.get(`/authority/issue/${issueId}`),
  verifyIssue: (issueId, action) => api.post(`/authority/issue/${issueId}/verify`, { action }),
  updateIssueStatus: (issueId, status, resolutionProofUrl) => 
    api.post(`/authority/issue/${issueId}/status`, { status, resolutionProofUrl }),
  updateIssueLocation: (issueId, locationData) =>
    api.post(`/authority/issue/${issueId}/location`, locationData),
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
    return api.get(`/analytics/heatmap${queryString ? '?' + queryString : ''}`);
  },
  getSummary: () => api.get('/analytics/summary'),
  getCategories: () => api.get('/analytics/categories'),
};

export const adminAPI = {
  getAnalytics: () => api.get('/admin/analytics'),
  createAuthority: (data) => api.post('/admin/authorities', data),
  getAuthorities: () => api.get('/admin/authorities'),
  deleteAuthority: (id) => api.delete(`/admin/authorities/${id}`),
  getSLABreaches: () => api.get('/admin/sla-breaches'),
  getCategories: () => api.get('/complaints/categories'),
};

export const jurisdictionAPI = {
  create: (data) => api.post('/jurisdictions', data),
  getAll: () => api.get('/jurisdictions'),
  delete: (id) => api.delete(`/jurisdictions/${id}`),
  detect: (data) => api.post('/jurisdiction-detection/detect', data),
  test: (data) => api.post('/jurisdiction-detection/test', data),
};

export default api;
