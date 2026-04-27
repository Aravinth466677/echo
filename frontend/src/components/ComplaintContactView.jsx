import React, { useState, useEffect } from 'react';
import { complaintAPI } from '../services/api';

const ComplaintContactView = ({ complaintId, onClose }) => {
  const [complaint, setComplaint] = useState(null);
  const [contactInfo, setContactInfo] = useState(null);
  const [showContact, setShowContact] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchComplaintDetails();
  }, [complaintId]);

  const fetchComplaintDetails = async () => {
    try {
      setLoading(true);
      const response = await complaintAPI.getComplaintDetails(complaintId);
      setComplaint(response.data.complaint);
    } catch (err) {
      setError('Failed to load complaint details');
      console.error('Error fetching complaint details:', err);
    } finally {
      setLoading(false);
    }
  };

  const viewContactInfo = async () => {
    try {
      setLoading(true);
      const response = await complaintAPI.getComplaintContact(complaintId);
      setContactInfo(response.data.contact);
      setShowContact(true);
    } catch (err) {
      setError('Access denied or failed to fetch contact information');
      console.error('Error fetching contact info:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !complaint) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="loading">Loading complaint details...</div>
        </div>
      </div>
    );
  }

  if (error && !complaint) {
    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="error">{error}</div>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '600px', padding: '20px' }}>
        <div className="modal-header">
          <h3>Complaint Details #{complaint?.id}</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        {complaint && (
          <div className="complaint-details">
            <div className="detail-section">
              <h4>Issue Information</h4>
              <p><strong>Category:</strong> {complaint.category_name}</p>
              <p><strong>Status:</strong> {complaint.status}</p>
              <p><strong>Description:</strong> {complaint.description}</p>
              <p><strong>Reported:</strong> {new Date(complaint.created_at).toLocaleString()}</p>
              {complaint.jurisdiction_name && (
                <p><strong>Jurisdiction:</strong> {complaint.jurisdiction_name}</p>
              )}
            </div>

            <div className="detail-section">
              <h4>Location</h4>
              <p><strong>Coordinates:</strong> {complaint.location.latitude}, {complaint.location.longitude}</p>
              {complaint.report_mode && (
                <p><strong>Report Mode:</strong> {complaint.report_mode}</p>
              )}
              {complaint.trust_level && (
                <p><strong>Trust Level:</strong> {complaint.trust_level}</p>
              )}
            </div>

            <div className="detail-section">
              <h4>Reporter Information</h4>
              <p><strong>Status:</strong> {complaint.reporter.verification_status}</p>
              <p><strong>Name:</strong> {complaint.reporter.name}</p>
              <p><strong>Email:</strong> {complaint.reporter.email}</p>
              <p><strong>Phone:</strong> {complaint.reporter.phone_masked}</p>
              
              {!showContact ? (
                <button 
                  onClick={viewContactInfo} 
                  className="contact-btn"
                  style={{
                    background: '#2563eb',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '10px'
                  }}
                >
                  View Full Contact Info
                </button>
              ) : (
                <div className="contact-info" style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  padding: '15px',
                  borderRadius: '4px',
                  marginTop: '10px'
                }}>
                  <h5 style={{ margin: '0 0 10px 0', color: '#92400e' }}>
                    Full Contact Information
                  </h5>
                  <p><strong>Full Phone:</strong> {contactInfo?.phone}</p>
                  <p><strong>Email:</strong> {contactInfo?.email}</p>
                  <p><strong>Name:</strong> {contactInfo?.name}</p>
                  <p style={{ 
                    fontSize: '12px', 
                    color: '#dc2626', 
                    fontWeight: 'bold',
                    marginTop: '10px'
                  }}>
                    ⚠️ {contactInfo?.warning}
                  </p>
                </div>
              )}
            </div>

            {complaint.issue && (
              <div className="detail-section">
                <h4>Issue Status</h4>
                <p><strong>Echo Count:</strong> {complaint.issue.echo_count}</p>
                <p><strong>Issue Status:</strong> {complaint.issue.status}</p>
              </div>
            )}

            {complaint.evidence_url && (
              <div className="detail-section">
                <h4>Evidence</h4>
                <img 
                  src={complaint.evidence_url} 
                  alt="Complaint evidence" 
                  style={{ maxWidth: '100%', height: 'auto', borderRadius: '4px' }}
                />
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="error" style={{ 
            color: '#dc2626', 
            background: '#fee2e2', 
            padding: '10px', 
            borderRadius: '4px',
            marginTop: '10px'
          }}>
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplaintContactView;