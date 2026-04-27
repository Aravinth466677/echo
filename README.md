# Echo - Civic Complaint Management System

A geo-enabled civic complaint aggregation and accountability system that allows citizens to report issues with photo/video evidence and GPS location. The system uses rule-based aggregation to combine similar reports into single issues with an Echo Count.

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL (v12 or higher) with PostGIS extension
- npm or yarn

### Setup
1. **Database Setup**
   ```bash
   # Create database and enable PostGIS
   psql -U postgres
   CREATE DATABASE echo_db;
   \c echo_db
   CREATE EXTENSION postgis;
   \q
   
   # Run schema
   cd database
   psql -U postgres -d echo_db -f schema.sql
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   copy .env.example .env
   # Edit .env with your database credentials
   npm start
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm start
   ```

### Access
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000/api
- Default Admin: admin@echo.gov / admin123

## System Architecture

```
Frontend (React) → Backend (Express/Node.js) → Database (PostgreSQL + PostGIS)
```

### Key Features
- **Citizens**: Report issues with GPS location and photo/video evidence
- **Authorities**: Verify and manage complaints with SLA tracking
- **Admins**: System analytics and authority management
- **Echo Aggregation**: Rule-based complaint clustering by location and category

## Documentation

All detailed documentation is available in the `docs/` directory:

- **[START_HERE.md](docs/START_HERE.md)** - Complete setup guide
- **[QUICKSTART.md](docs/QUICKSTART.md)** - Fast deployment guide
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System design overview
- **[DATABASE_MANAGEMENT.md](docs/DATABASE_MANAGEMENT.md)** - Database operations
- **[DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Production deployment

## Project Structure

```
Echo/
├── backend/           # Express.js API server
├── frontend/          # React web application  
├── database/          # SQL schema and migrations
├── docs/             # Documentation (gitignored)
└── README.md         # This file
```

## License

This project is for educational and civic purposes.