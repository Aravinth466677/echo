import React from 'react';
import './HeatmapFilters.css';

const HeatmapFilters = ({ 
  filters, 
  onFiltersChange, 
  categories, 
  loading 
}) => {
  const timeRangeOptions = [
    { value: 7, label: '7 days' },
    { value: 30, label: '30 days' },
    { value: 90, label: '90 days' }
  ];

  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'pending', label: 'Pending' },
    { value: 'verified', label: 'Verified' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'rejected', label: 'Rejected' }
  ];

  const handleFilterChange = (key, value) => {
    onFiltersChange({
      ...filters,
      [key]: value
    });
  };

  return (
    <div className="heatmap-filters">
      <div className="filters-row">
        {/* Category Filter */}
        <div className="filter-group">
          <label htmlFor="category-filter">Category</label>
          <select
            id="category-filter"
            value={filters.categoryId || 'all'}
            onChange={(e) => handleFilterChange('categoryId', e.target.value)}
            disabled={loading}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {categories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* Time Range Filter */}
        <div className="filter-group">
          <label htmlFor="time-filter">Time Range</label>
          <select
            id="time-filter"
            value={filters.days || 7}
            onChange={(e) => handleFilterChange('days', parseInt(e.target.value))}
            disabled={loading}
            className="filter-select"
          >
            {timeRangeOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div className="filter-group">
          <label htmlFor="status-filter">Status</label>
          <select
            id="status-filter"
            value={filters.status || 'all'}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            disabled={loading}
            className="filter-select"
          >
            {statusOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active Filters Display */}
      {(filters.categoryId !== 'all' || filters.days !== 7 || filters.status !== 'all') && (
        <div className="active-filters">
          <span className="active-filters-label">Active filters:</span>
          {filters.categoryId !== 'all' && (
            <span className="filter-tag">
              Category: {categories.find(c => c.id == filters.categoryId)?.name || 'Unknown'}
            </span>
          )}
          {filters.days !== 7 && (
            <span className="filter-tag">
              {filters.days} days
            </span>
          )}
          {filters.status !== 'all' && (
            <span className="filter-tag">
              Status: {statusOptions.find(s => s.value === filters.status)?.label || filters.status}
            </span>
          )}
          <button 
            className="clear-filters-btn"
            onClick={() => onFiltersChange({ categoryId: 'all', days: 7, status: 'all' })}
            disabled={loading}
          >
            Clear All
          </button>
        </div>
      )}
    </div>
  );
};

export default HeatmapFilters;