# Echo - Civic Complaint Management System

A geo-enabled civic complaint aggregation and accountability system that allows citizens to report issues with photo/video evidence and GPS location. The system uses rule-based aggregation to combine similar reports into single issues with an Echo Count.

## System Architecture

```
Frontend (React) → Backend (Express/Node.js) → Database (PostgreSQL + PostGIS)
```

### Component Responsibilities

- **Frontend**: Role-based UI for Citizens, Authorities, and Admins
- **Backend**: RESTful API with authentication, complaint aggregation, and verification
- **Database**: Relational data storage with geospatial indexing for location-based queries

## Features

### Citizen Features
- Self-registration and login
- Report issues with mandatory photo/video evidence
- GPS-based location capture
- View personal complaint history
- View area issues (read-only)

### Authority Features
- Pre-created account login
- Verification queue for pending issues
- Accept/Reject issues with evidence review
- Update issue status (In Progress, Resolved)
- View active issues with SLA tracking

### Admin Features
- System analytics dashboard
- Create and manage authority accounts
- Monitor SLA breaches
- Category-wise statistics

## Echo Aggregation Logic (Rule-Based)

When a complaint is submitted:

1. **Category Match**: Check if category matches existing issues
2. **Spatial Proximity**: Check if location is within aggregation radius (category-specific)
3. **Time Window**: Check if within time window (category-specific, e.g., 72 hours)
4. **Duplicate Prevention**: Prevent same user from increasing Echo count for same issue

**If matched**: Link as supporting report, increment Echo count
**If not matched**: Create new issue with Echo count = 1

## Database Schema

### Key Tables
- `users`: Citizens, Authorities, Admins
- `categories`: Issue categories with aggregation rules
- `issues`: Aggregated issues with Echo count
- `complaints`: Individual reports linked to issues
- `audit_logs`: System activity tracking
- `authority_assignments`: Authority-ward mappings

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL (v12 or higher) with PostGIS extension
- npm or yarn

## Setup Instructions

### 1. Database Setup

#### Install PostgreSQL and PostGIS

**Windows:**
```bash
# Download and install PostgreSQL from https://www.postgresql.org/download/windows/
# PostGIS is included in the installer
```

**Linux:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib postgis
```

#### Create Database

```bash
# Login to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE echo_db;

# Connect to database
\c echo_db

# Enable PostGIS extension
CREATE EXTENSION postgis;

# Exit
\q
```

#### Run Schema

```bash
cd c:\project\Echo\database
psql -U postgres -d echo_db -f schema.sql
```

### 2. Backend Setup

```bash
cd c:\project\Echo\backend

# Install dependencies
npm install

# Create .env file
copy .env.example .env

# Edit .env file with your database credentials
# DB_HOST=localhost
# DB_PORT=5432
# DB_NAME=echo_db
# DB_USER=postgres
# DB_PASSWORD=your_password
# JWT_SECRET=your_secret_key_here

# Start backend server with auto-reload
npm start

# For a plain one-time Node server run
npm run start:prod
```

Backend will run on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd c:\project\Echo\frontend

# Install dependencies
npm install

# Create .env file (optional for local development)
echo REACT_APP_API_URL=http://localhost:5000/api > .env

# Start frontend
npm start
```

Frontend will run on `http://localhost:3000`

For ngrok or other public access, set `REACT_APP_API_URL` to your backend's public `/api` URL instead of `localhost`.

## Running the Application

### Start Backend
```bash
cd c:\project\Echo\backend
npm start
```

`npm start` now runs the backend with auto-reload through `nodemon`.

### Start Frontend
```bash
cd c:\project\Echo\frontend
npm start
```

### Access the Application

1. Open browser: `http://localhost:3000`
2. Register as a citizen or login with default admin:
   - Email: `admin@echo.gov`
   - Password: `admin123`

## Default Test Accounts

### Admin
- Email: `admin@echo.gov`
- Password: `admin123`

### Creating Authority Accounts
Use the Admin dashboard to create authority accounts.

## API Endpoints

### Authentication
- `POST /api/auth/register` - Citizen registration
- `POST /api/auth/login` - User login

### Complaints (Citizen)
- `POST /api/complaints/submit` - Submit complaint with evidence
- `GET /api/complaints/my-complaints` - Get user's complaints
- `GET /api/complaints/area-issues` - Get issues in area
- `GET /api/complaints/categories` - Get issue categories

### Authority
- `GET /api/authority/verification-queue` - Get pending issues
- `GET /api/authority/active-issues` - Get verified/in-progress issues
- `GET /api/authority/issue/:issueId` - Get issue details
- `POST /api/authority/issue/:issueId/verify` - Accept/Reject issue
- `POST /api/authority/issue/:issueId/status` - Update issue status

### Admin
- `GET /api/admin/analytics` - System statistics
- `POST /api/admin/authorities` - Create authority account
- `GET /api/admin/authorities` - List authorities
- `GET /api/admin/sla-breaches` - Get SLA breaches

## Environment Variables

### Backend (.env)
```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=echo_db
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret_key
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000/api
```

For public frontend access, use your backend tunnel URL instead, for example:
```
REACT_APP_API_URL=https://your-backend-subdomain.ngrok-free.dev/api
```

## Security Features

1. **JWT Authentication**: Token-based authentication with role verification
2. **Password Hashing**: bcrypt with salt rounds
3. **Role-Based Access Control**: Endpoint protection by user role
4. **Audit Logging**: All critical actions logged with user and IP
5. **File Upload Validation**: Type and size restrictions
6. **Identity Masking**: Personal data not exposed in public views

## Aggregation Parameters

Configurable per category in database:

- `aggregation_radius_meters`: Spatial proximity threshold (default: 100m)
- `aggregation_time_window_hours`: Time window for aggregation (default: 72h)
- `sla_hours`: Service level agreement deadline (default: 168h)

## Project Structure

```
Echo/
├── backend/
│   ├── config/
│   │   └── database.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── complaintController.js
│   │   ├── authorityController.js
│   │   └── adminController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── auditLog.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── complaints.js
│   │   ├── authority.js
│   │   └── admin.js
│   ├── services/
│   │   └── aggregationService.js
│   ├── uploads/
│   ├── .env
│   ├── package.json
│   └── server.js
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── components/
│   │   │   ├── Login.js
│   │   │   ├── Login.css
│   │   │   └── Register.js
│   │   ├── context/
│   │   │   └── AuthContext.js
│   │   ├── pages/
│   │   │   ├── CitizenDashboard.js
│   │   │   ├── ReportIssue.js
│   │   │   ├── AuthorityDashboard.js
│   │   │   ├── AdminDashboard.js
│   │   │   ├── Dashboard.css
│   │   │   └── ReportIssue.css
│   │   ├── services/
│   │   │   └── api.js
│   │   ├── App.js
│   │   ├── index.js
│   │   └── index.css
│   └── package.json
└── database/
    └── schema.sql
```

## Extending to Mobile (React Native)

The architecture is designed to support React Native:

1. Backend API is already mobile-ready (RESTful)
2. Reuse authentication context and API service layer
3. Replace React Router with React Navigation
4. Use React Native Camera for photo/video capture
5. Use React Native Geolocation for GPS
6. Use React Native Maps for location display

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check credentials in `.env`
- Ensure PostGIS extension is enabled

### File Upload Error
- Check `uploads/` directory exists in backend
- Verify file size limits in multer config

### GPS Not Working
- Enable location permissions in browser
- Use HTTPS in production (required for geolocation)

### Port Already in Use
- Change PORT in backend `.env`
- Update REACT_APP_API_URL in frontend `.env`

## Production Deployment

### Backend
1. Set `NODE_ENV=production`
2. Use strong JWT_SECRET
3. Configure CORS for specific origins
4. Use environment-specific database
5. Enable HTTPS
6. Use process manager (PM2)

### Frontend
1. Build production bundle: `npm run build`
2. Serve with nginx or similar
3. Configure `REACT_APP_API_URL` for the public backend URL if frontend and backend are not on the same origin

### Database
1. Regular backups
2. Enable SSL connections
3. Optimize indexes for query performance
4. Monitor geospatial query performance

## License

This project is for educational and civic purposes.
