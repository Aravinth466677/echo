--
-- PostgreSQL database dump
--

-- Dumped from database version 18.1
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- Name: authority_level; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.authority_level AS ENUM (
    'SUPER_ADMIN',
    'DEPARTMENT',
    'JURISDICTION'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.notification_type AS ENUM (
    'STATUS_UPDATE',
    'ASSIGNED',
    'RESOLVED',
    'VERIFIED',
    'REJECTED',
    'REOPENED',
    'CLOSED',
    'SLA_BREACH',
    'ESCALATED'
);


--
-- Name: calculate_distance_meters(numeric, numeric, numeric, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_distance_meters(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric) RETURNS integer
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Use PostGIS ST_Distance for accurate calculation
    RETURN ST_Distance(
        ST_SetSRID(ST_MakePoint(lon1, lat1), 4326)::geography,
        ST_SetSRID(ST_MakePoint(lon2, lat2), 4326)::geography
    )::INTEGER;
END;
$$;


--
-- Name: calculate_sla_status(timestamp without time zone, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_sla_status(sla_deadline timestamp without time zone, issue_status character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
        DECLARE
            current_ts TIMESTAMP := LOCALTIMESTAMP;
            remaining_seconds INTEGER;
            is_breached BOOLEAN;
            status_color VARCHAR(10);
            display_text TEXT;
        BEGIN
            -- If issue is resolved, SLA is complete
            IF issue_status IN ('resolved', 'rejected') THEN
                RETURN jsonb_build_object(
                    'remaining_seconds', 0,
                    'is_breached', FALSE,
                    'status_color', 'green',
                    'display_text', 'Completed'
                );
            END IF;

            -- Calculate remaining time using a timestamp value to match sla_deadline
            remaining_seconds := EXTRACT(EPOCH FROM (sla_deadline - current_ts))::INTEGER;
            is_breached := remaining_seconds < 0;

            -- Determine status color and text
            IF is_breached THEN
                status_color := 'red';
                display_text := 'SLA Breached';
            ELSIF remaining_seconds < 3600 THEN
                status_color := 'red';
                display_text := 'Critical';
            ELSIF remaining_seconds < 7200 THEN
                status_color := 'orange';
                display_text := 'Urgent';
            ELSE
                status_color := 'green';
                display_text := 'On Track';
            END IF;

            RETURN jsonb_build_object(
                'remaining_seconds', remaining_seconds,
                'is_breached', is_breached,
                'status_color', status_color,
                'display_text', display_text
            );
        END;
        $$;


--
-- Name: check_reporting_limits(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_reporting_limits(p_user_id integer, p_trust_level character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $$
DECLARE
    daily_limit INTEGER := 10;
    low_trust_limit INTEGER := 3;
    current_count INTEGER := 0;
    current_low_trust INTEGER := 0;
    result JSONB;
BEGIN
    -- Get current counts for today
    SELECT 
        COALESCE(report_count, 0),
        COALESCE(low_trust_count, 0)
    INTO current_count, current_low_trust
    FROM user_reporting_limits 
    WHERE user_id = p_user_id AND report_date = CURRENT_DATE;
    
    -- Check limits
    IF current_count >= daily_limit THEN
        result := jsonb_build_object(
            'allowed', false,
            'reason', 'daily_limit_exceeded',
            'message', 'Daily reporting limit exceeded. Please try again tomorrow.',
            'current_count', current_count,
            'daily_limit', daily_limit
        );
    ELSIF p_trust_level = 'low' AND current_low_trust >= low_trust_limit THEN
        result := jsonb_build_object(
            'allowed', false,
            'reason', 'low_trust_limit_exceeded',
            'message', 'Too many remote reports today. Please report from closer locations.',
            'current_low_trust', current_low_trust,
            'low_trust_limit', low_trust_limit
        );
    ELSE
        result := jsonb_build_object(
            'allowed', true,
            'current_count', current_count,
            'daily_limit', daily_limit,
            'current_low_trust', current_low_trust,
            'low_trust_limit', low_trust_limit
        );
    END IF;
    
    RETURN result;
END;
$$;


--
-- Name: cleanup_old_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_notifications() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete read notifications older than 30 days
    DELETE FROM notifications 
    WHERE is_read = TRUE 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete unread notifications older than 90 days (safety cleanup)
    DELETE FROM notifications 
    WHERE is_read = FALSE 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    RETURN deleted_count;
END;
$$;


--
-- Name: cleanup_old_rate_limits(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_old_rate_limits() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    DELETE FROM user_rate_limits WHERE submission_date < CURRENT_DATE - INTERVAL '7 days';
END;
$$;


--
-- Name: determine_trust_level(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.determine_trust_level(distance_meters integer) RETURNS character varying
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF distance_meters <= 1000 THEN
        RETURN 'high';
    ELSIF distance_meters <= 3000 THEN
        RETURN 'medium';
    ELSIF distance_meters <= 5000 THEN
        RETURN 'low';
    ELSE
        RETURN 'unverified';
    END IF;
END;
$$;


--
-- Name: format_remaining_time(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.format_remaining_time(remaining_seconds integer) RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    days INTEGER;
    hours INTEGER;
    minutes INTEGER;
    result TEXT := '';
BEGIN
    IF remaining_seconds <= 0 THEN
        RETURN 'Overdue';
    END IF;
    
    days := remaining_seconds / 86400;
    hours := (remaining_seconds % 86400) / 3600;
    minutes := (remaining_seconds % 3600) / 60;
    
    IF days > 0 THEN
        result := days || 'd ';
    END IF;
    
    IF hours > 0 OR days > 0 THEN
        result := result || hours || 'h ';
    END IF;
    
    result := result || minutes || 'm';
    
    RETURN TRIM(result);
END;
$$;


--
-- Name: update_jurisdiction_area(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_jurisdiction_area() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.area_sq_meters := ST_Area(NEW.boundary::geography);
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_notification_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_notification_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_reporting_limits(integer, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_reporting_limits(p_user_id integer, p_trust_level character varying) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
    INSERT INTO user_reporting_limits (user_id, report_date, report_count, low_trust_count)
    VALUES (
        p_user_id, 
        CURRENT_DATE, 
        1, 
        CASE WHEN p_trust_level = 'low' THEN 1 ELSE 0 END
    )
    ON CONFLICT (user_id, report_date) 
    DO UPDATE SET 
        report_count = user_reporting_limits.report_count + 1,
        low_trust_count = user_reporting_limits.low_trust_count + 
            CASE WHEN p_trust_level = 'low' THEN 1 ELSE 0 END;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id integer NOT NULL,
    user_id integer,
    action character varying(100) NOT NULL,
    entity_type character varying(50),
    entity_id integer,
    details jsonb,
    ip_address character varying(45),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_logs_id_seq OWNED BY public.audit_logs.id;


--
-- Name: authorities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.authorities (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(20),
    authority_level character varying(20) NOT NULL,
    jurisdiction_id integer,
    category_id integer,
    department character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT authorities_authority_level_check CHECK (((authority_level)::text = ANY ((ARRAY['SUPER_ADMIN'::character varying, 'DEPARTMENT'::character varying, 'JURISDICTION'::character varying])::text[])))
);


--
-- Name: authorities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.authorities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: authorities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.authorities_id_seq OWNED BY public.authorities.id;


--
-- Name: categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categories (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    aggregation_radius_meters integer DEFAULT 100,
    aggregation_time_window_hours integer DEFAULT 72,
    sla_hours integer DEFAULT 168,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.categories_id_seq OWNED BY public.categories.id;


--
-- Name: complaint_routing_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaint_routing_logs (
    id integer NOT NULL,
    complaint_id integer,
    issue_id integer,
    routed_to_user_id integer,
    authority_level character varying(20),
    authority_email character varying(255),
    authority_name character varying(255),
    jurisdiction_id integer,
    jurisdiction_name character varying(255),
    category_id integer,
    category_name character varying(100),
    routing_reason character varying(50),
    echo_count integer DEFAULT 1,
    routed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    routing_details jsonb,
    routed_to_authority_id integer,
    CONSTRAINT complaint_routing_logs_authority_level_check CHECK (((authority_level)::text = ANY ((ARRAY['JURISDICTION'::character varying, 'DEPARTMENT'::character varying, 'SUPER_ADMIN'::character varying])::text[]))),
    CONSTRAINT complaint_routing_logs_routing_reason_check CHECK (((routing_reason)::text = ANY ((ARRAY['NORMAL'::character varying, 'HIGH_PRIORITY_ESCALATION'::character varying, 'MEDIUM_PRIORITY_ESCALATION'::character varying, 'NO_JURISDICTION'::character varying, 'NO_JURISDICTION_AUTHORITY'::character varying, 'JURISDICTION_FALLBACK'::character varying, 'NO_DEPARTMENT_AUTHORITY'::character varying, 'SUPER_ADMIN_FALLBACK'::character varying, 'RE_ROUTING'::character varying, 'SLA_ESCALATION'::character varying])::text[])))
);


--
-- Name: complaint_routing_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.complaint_routing_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: complaint_routing_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.complaint_routing_logs_id_seq OWNED BY public.complaint_routing_logs.id;


--
-- Name: complaints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.complaints (
    id integer NOT NULL,
    issue_id integer,
    user_id integer,
    category_id integer,
    location public.geography(Point,4326) NOT NULL,
    latitude numeric(10,8) NOT NULL,
    longitude numeric(11,8) NOT NULL,
    evidence_url character varying(500) NOT NULL,
    evidence_type character varying(10),
    description text,
    is_primary boolean DEFAULT false,
    status character varying(20) DEFAULT 'submitted'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    jurisdiction_id integer,
    assigned_to integer,
    escalated_to integer,
    escalation_level integer DEFAULT 0,
    escalated_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    assigned_authority_id integer,
    escalated_authority_id integer,
    routing_reason character varying(50),
    reporter_location public.geography(Point,4326),
    reporter_latitude numeric(10,8),
    reporter_longitude numeric(11,8),
    distance_meters integer,
    trust_level character varying(10),
    remote_justification text,
    justification_type character varying(50),
    location_verification_status character varying(20) DEFAULT 'verified'::character varying,
    report_mode character varying(20) DEFAULT 'single_location'::character varying,
    image_hash character varying(64),
    validation_status character varying(20) DEFAULT 'VALID'::character varying,
    location_confidence character varying(10) DEFAULT 'MEDIUM'::character varying,
    duplicate_of integer,
    metadata_validation jsonb,
    CONSTRAINT complaints_evidence_type_check CHECK (((evidence_type)::text = ANY ((ARRAY['photo'::character varying, 'video'::character varying])::text[]))),
    CONSTRAINT complaints_location_confidence_check CHECK (((location_confidence)::text = ANY ((ARRAY['HIGH'::character varying, 'MEDIUM'::character varying, 'LOW'::character varying])::text[]))),
    CONSTRAINT complaints_location_verification_status_check CHECK (((location_verification_status)::text = ANY ((ARRAY['verified'::character varying, 'unverified'::character varying, 'manual'::character varying])::text[]))),
    CONSTRAINT complaints_status_check CHECK (((status)::text = ANY ((ARRAY['submitted'::character varying, 'assigned'::character varying, 'escalated'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'rejected'::character varying])::text[]))),
    CONSTRAINT complaints_trust_level_check CHECK (((trust_level)::text = ANY ((ARRAY['high'::character varying, 'medium'::character varying, 'low'::character varying, 'unverified'::character varying])::text[]))),
    CONSTRAINT complaints_validation_status_check CHECK (((validation_status)::text = ANY ((ARRAY['VALID'::character varying, 'DUPLICATE'::character varying, 'SUSPECTED'::character varying, 'LOW_CONFIDENCE'::character varying])::text[])))
);


--
-- Name: COLUMN complaints.reporter_location; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.reporter_location IS 'GPS location of the person reporting the issue';


--
-- Name: COLUMN complaints.reporter_latitude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.reporter_latitude IS 'Latitude of reporter location';


--
-- Name: COLUMN complaints.reporter_longitude; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.reporter_longitude IS 'Longitude of reporter location';


--
-- Name: COLUMN complaints.distance_meters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.distance_meters IS 'Distance between reporter and issue location in meters';


--
-- Name: COLUMN complaints.trust_level; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.trust_level IS 'Trust level based on distance: high, medium, low, unverified';


--
-- Name: COLUMN complaints.remote_justification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.remote_justification IS 'Justification for remote reporting';


--
-- Name: COLUMN complaints.justification_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.justification_type IS 'Type of justification: traveling, reporting_for_other, other';


--
-- Name: COLUMN complaints.location_verification_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.location_verification_status IS 'Status of location verification';


--
-- Name: COLUMN complaints.report_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.complaints.report_mode IS 'Reporting method: single_location (at issue location) or dual_location (remote reporting)';


--
-- Name: complaints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.complaints_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: complaints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.complaints_id_seq OWNED BY public.complaints.id;


--
-- Name: image_hashes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.image_hashes (
    id integer NOT NULL,
    complaint_id integer,
    image_hash character varying(64) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: image_hashes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.image_hashes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: image_hashes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.image_hashes_id_seq OWNED BY public.image_hashes.id;


--
-- Name: issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.issues (
    id integer NOT NULL,
    category_id integer,
    location public.geography(Point,4326) NOT NULL,
    ward_id integer,
    status character varying(20) DEFAULT 'pending'::character varying,
    echo_count integer DEFAULT 1,
    first_reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    last_reported_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    verified_at timestamp without time zone,
    verified_by integer,
    resolved_at timestamp without time zone,
    resolved_by integer,
    resolution_proof_url character varying(500),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    jurisdiction_id integer,
    verified_by_authority_id integer,
    resolved_by_authority_id integer,
    verified_address text,
    landmark_note text,
    sla_duration_hours integer,
    sla_deadline timestamp without time zone,
    is_sla_breached boolean DEFAULT false,
    escalated_at timestamp without time zone,
    escalation_reason text,
    CONSTRAINT issues_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'verified'::character varying, 'in_progress'::character varying, 'resolved'::character varying, 'rejected'::character varying])::text[])))
);


--
-- Name: COLUMN issues.sla_duration_hours; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issues.sla_duration_hours IS 'SLA duration in hours from category';


--
-- Name: COLUMN issues.sla_deadline; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issues.sla_deadline IS 'Calculated SLA deadline timestamp';


--
-- Name: COLUMN issues.is_sla_breached; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issues.is_sla_breached IS 'Whether SLA has been breached';


--
-- Name: COLUMN issues.escalated_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issues.escalated_at IS 'When issue was escalated due to SLA breach';


--
-- Name: COLUMN issues.escalation_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.issues.escalation_reason IS 'Reason for escalation';


--
-- Name: issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.issues_id_seq OWNED BY public.issues.id;


--
-- Name: jurisdictions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.jurisdictions (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    boundary public.geometry(Polygon,4326) NOT NULL,
    area_sq_meters double precision,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: jurisdictions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.jurisdictions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: jurisdictions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.jurisdictions_id_seq OWNED BY public.jurisdictions.id;


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    type character varying(50) NOT NULL,
    is_read boolean DEFAULT false,
    complaint_id integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'In-app notifications for complaint management system';


--
-- Name: COLUMN notifications.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.type IS 'Notification type: STATUS_UPDATE, ASSIGNED, RESOLVED, etc.';


--
-- Name: COLUMN notifications.is_read; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.is_read IS 'Whether the notification has been read by the user';


--
-- Name: COLUMN notifications.complaint_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.notifications.complaint_id IS 'Related complaint ID (nullable for system notifications)';


--
-- Name: user_rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_rate_limits (
    id integer NOT NULL,
    user_id integer,
    submission_date date DEFAULT CURRENT_DATE,
    hourly_count integer DEFAULT 0,
    daily_count integer DEFAULT 0,
    last_submission timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_rate_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_rate_limits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_rate_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_rate_limits_id_seq OWNED BY public.user_rate_limits.id;


--
-- Name: user_reporting_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_reporting_limits (
    id integer NOT NULL,
    user_id integer,
    report_date date DEFAULT CURRENT_DATE,
    report_count integer DEFAULT 0,
    low_trust_count integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_reporting_limits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_reporting_limits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_reporting_limits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_reporting_limits_id_seq OWNED BY public.user_reporting_limits.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) NOT NULL,
    full_name character varying(255) NOT NULL,
    phone character varying(20),
    ward_id integer,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs ALTER COLUMN id SET DEFAULT nextval('public.audit_logs_id_seq'::regclass);


--
-- Name: authorities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorities ALTER COLUMN id SET DEFAULT nextval('public.authorities_id_seq'::regclass);


--
-- Name: categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories ALTER COLUMN id SET DEFAULT nextval('public.categories_id_seq'::regclass);


--
-- Name: complaint_routing_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs ALTER COLUMN id SET DEFAULT nextval('public.complaint_routing_logs_id_seq'::regclass);


--
-- Name: complaints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints ALTER COLUMN id SET DEFAULT nextval('public.complaints_id_seq'::regclass);


--
-- Name: image_hashes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_hashes ALTER COLUMN id SET DEFAULT nextval('public.image_hashes_id_seq'::regclass);


--
-- Name: issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues ALTER COLUMN id SET DEFAULT nextval('public.issues_id_seq'::regclass);


--
-- Name: jurisdictions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions ALTER COLUMN id SET DEFAULT nextval('public.jurisdictions_id_seq'::regclass);


--
-- Name: user_rate_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rate_limits ALTER COLUMN id SET DEFAULT nextval('public.user_rate_limits_id_seq'::regclass);


--
-- Name: user_reporting_limits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reporting_limits ALTER COLUMN id SET DEFAULT nextval('public.user_reporting_limits_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at) FROM stdin;
1	4	USER_REGISTERED	user	4	{"email": "admin@echo.gov"}	::1	2026-02-09 10:56:05.188087
2	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-09 11:03:46.078996
3	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-09 11:14:35.739847
4	5	USER_REGISTERED	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-09 19:02:35.472724
5	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-09 19:02:45.632857
6	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-09 19:12:48.355064
10	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:40:35.821385
9	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:40:35.825418
8	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:40:35.818424
7	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:40:35.823238
11	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:40:35.944235
12	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-10 08:42:38.95799
13	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:43:46.931702
14	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 08:59:59.040862
15	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-10 09:01:00.095043
16	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-10 09:11:33.800626
17	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 20:32:01.520825
18	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:09:32.264792
19	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-18 21:10:59.513003
20	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:16:47.413225
21	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:19:34.113028
22	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:21:44.812202
23	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:22:20.491932
24	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:35:51.967758
25	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-02-18 21:39:20.45862
26	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 21:59:18.392726
27	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 22:17:27.724004
29	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 22:48:44.464514
30	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-18 22:49:09.153486
31	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 05:02:09.475358
33	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-02-19 05:18:49.49088
36	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 05:19:55.405194
37	10	USER_REGISTERED	user	10	{"email": "sarathiraj7@gmail.com"}	::1	2026-02-19 05:22:22.1509
38	11	USER_REGISTERED	user	11	{"email": "sarathi2@gmail.com"}	::1	2026-02-19 05:23:41.00962
39	11	USER_LOGIN	user	11	{"email": "sarathi2@gmail.com"}	::1	2026-02-19 05:24:01.331728
41	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 05:25:13.55959
42	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-02-19 05:29:28.229646
44	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 05:30:25.474863
46	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-02-19 05:38:58.761441
47	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-02-19 06:13:04.914311
49	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 06:15:12.978309
51	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-02-19 06:16:48.985165
52	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-02-19 06:17:46.276767
53	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-02-19 06:22:10.722165
54	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 10:14:53.448878
56	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-02-19 10:17:22.778431
58	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-19 10:18:04.748785
59	11	USER_LOGIN	user	11	{"email": "sarathi2@gmail.com"}	::1	2026-02-19 10:21:16.368804
61	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-02-19 10:23:33.122555
62	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-20 10:33:45.344753
63	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-20 13:43:23.742489
64	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-23 09:56:41.866821
65	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-02-23 11:48:00.400924
66	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-04 11:23:09.989002
67	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 12:51:17.167789
68	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 13:05:25.87455
69	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 13:06:40.301704
70	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 13:12:56.276503
71	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 13:23:27.104526
72	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-06 13:23:34.366583
73	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 09:55:17.089775
74	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 10:18:19.147629
75	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 10:23:17.504252
76	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 18:41:48.784957
77	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 18:46:56.805589
78	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 18:50:59.754775
79	4	JURISDICTION_CREATED	jurisdiction	1	{"name": "bengaluru"}	::1	2026-03-09 18:51:23.128134
80	4	JURISDICTION_CREATED	jurisdiction	2	{"name": "Rayavaram"}	::1	2026-03-09 20:07:57.832981
81	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 20:08:58.253648
82	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 21:57:46.767702
83	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:10:50.921136
84	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:11:17.605476
85	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:18:55.743
86	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:30:55.200444
87	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:32:10.745827
88	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:33:24.168413
89	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:36:49.78694
90	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:40:25.558304
91	4	AUTHORITY_CREATED	user	18	{"email": "pothole.rayavaram@echo.gov", "wardId": 1, "department": "Pothole", "authorityLevel": "JURISDICTION", "jurisdictionId": "2"}	::1	2026-03-09 22:41:25.623826
92	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-09 22:57:15.967495
93	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-09 22:58:31.921641
94	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-09 22:58:46.505793
95	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-09 22:58:51.648518
96	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-09 23:05:26.580219
97	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-09 23:06:10.150125
98	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-09 23:13:36.477513
99	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 06:21:45.880209
100	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 06:22:03.139554
101	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 06:22:11.463603
103	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 06:23:23.585427
104	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 06:23:53.358559
105	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 07:40:06.420012
106	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 07:40:12.741405
107	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 07:45:05.607893
108	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 07:45:30.300866
109	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 07:45:39.991597
110	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 07:55:00.653812
111	4	JURISDICTION_CREATED	jurisdiction	3	{"name": "vellanur"}	::1	2026-03-10 07:58:46.509654
112	4	AUTHORITY_CREATED	user	19	{"email": "garbage.vellanur@echo.gov", "wardId": 1, "department": "Garbage", "authorityLevel": "JURISDICTION", "jurisdictionId": "3"}	::1	2026-03-10 08:00:08.965986
113	19	USER_LOGIN	user	19	{"email": "garbage.vellanur@echo.gov"}	::1	2026-03-10 08:16:24.003666
114	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 09:27:19.853575
115	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 09:57:06.495331
116	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 09:57:23.231969
118	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 09:58:26.14205
119	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 10:11:16.010975
120	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 10:17:48.421898
121	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 10:17:53.191395
122	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 10:19:10.499827
124	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 10:20:47.814271
125	19	USER_LOGIN	user	19	{"email": "garbage.vellanur@echo.gov"}	::1	2026-03-10 10:21:30.313641
126	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 10:22:10.547948
127	13	USER_LOGIN	user	13	{"email": "streetlight@echo.gov"}	::1	2026-03-10 10:37:00.408341
128	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 11:23:29.234397
129	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 11:23:43.172204
130	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 11:24:03.192005
131	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:24:26.932044
132	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 11:25:38.704895
134	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:26:48.164294
138	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 11:34:05.52843
139	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:34:32.189573
140	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 11:47:26.163768
389	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-09 09:50:45.1777
141	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:47:48.065125
142	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 11:47:57.737325
144	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:49:07.484658
145	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 11:52:57.768611
146	20	USER_REGISTERED	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-10 11:55:43.860834
147	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-10 11:56:18.462054
149	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 11:57:23.853522
150	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 12:25:05.100013
151	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-03-10 12:25:33.905563
152	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 12:41:04.772359
153	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 12:41:09.038311
154	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 12:41:24.757323
156	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-03-10 12:42:22.176132
157	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-10 12:42:57.773754
159	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-03-10 12:43:58.372323
160	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-03-10 13:16:31.724518
161	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 13:27:13.768905
162	4	JURISDICTION_CREATED	jurisdiction	4	{"name": "anna university"}	::1	2026-03-10 13:34:29.868103
163	4	AUTHORITY_CREATED	user	21	{"email": "drainage.anna.university@echo.gov", "wardId": 1, "department": "Drainage", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-10 13:36:20.616552
165	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 13:37:09.137762
169	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 13:38:41.10182
170	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-10 13:55:40.166266
172	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 13:56:19.619001
174	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-10 13:57:33.944934
179	13	USER_LOGIN	user	13	{"email": "streetlight@echo.gov"}	::1	2026-03-10 14:08:31.751197
180	13	USER_LOGIN	user	13	{"email": "streetlight@echo.gov"}	::1	2026-03-10 14:08:37.259299
181	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 14:09:28.773705
184	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 15:20:57.881262
187	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-10 15:22:18.050924
188	4	AUTHORITY_CREATED	user	22	{"email": "pothole.anna.university@echo.gov", "wardId": 1, "department": "Pothole", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-10 18:44:46.771189
190	18	USER_LOGIN	user	18	{"email": "pothole.rayavaram@echo.gov"}	::1	2026-03-10 18:46:35.337624
193	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-10 18:47:29.657953
195	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 18:48:50.901979
196	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-10 18:48:54.424598
200	4	JURISDICTION_CREATED	jurisdiction	5	{"name": "MATHUR"}	::1	2026-03-11 10:17:07.758447
201	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-11 10:24:09.234686
202	4	JURISDICTION_DELETED	jurisdiction	5	{"name": "MATHUR"}	::1	2026-03-11 10:27:14.219119
205	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-11 11:10:39.992365
206	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-11 11:20:07.463858
207	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-11 11:22:00.341368
208	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-11 11:29:30.666694
209	4	AUTHORITY_CREATED	user	23	{"email": "garbage.anna.university@echo.gov", "wardId": 1, "department": "Garbage", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-11 11:31:40.027365
210	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-12 09:43:36.809259
211	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-12 09:44:12.527306
213	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-13 10:22:37.905086
214	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-13 10:22:50.966719
217	20	USER_LOGIN	user	20	{"email": "mahicitizen@gmail.com"}	::1	2026-03-13 10:32:21.312401
218	24	USER_REGISTERED	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-13 10:35:05.198922
219	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-13 10:35:25.92939
221	14	USER_LOGIN	user	14	{"email": "garbage@echo.gov"}	::1	2026-03-13 11:02:11.393022
222	25	USER_REGISTERED	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-13 12:57:54.704894
223	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-13 12:58:32.390291
224	9	USER_LOGIN	user	9	{"email": "drainage@echo.gov"}	::1	2026-03-13 14:41:32.530412
225	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-13 14:42:15.284859
226	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 09:39:10.501244
227	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 09:45:38.801847
230	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 09:54:34.224464
231	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-16 09:54:55.038073
232	12	USER_LOGIN	user	12	{"email": "pothole@echo.gov"}	::1	2026-03-16 09:55:00.749828
233	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 10:14:28.290377
234	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 10:14:43.121186
235	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 10:17:53.037277
237	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-16 10:19:59.537858
238	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 11:04:31.061037
239	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-16 11:10:28.348928
240	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 11:20:33.882508
241	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 11:55:47.076703
242	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 11:58:43.769739
244	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-16 12:19:33.366134
245	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-16 12:20:11.012383
246	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 13:03:30.69268
247	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 13:04:06.660199
248	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 13:31:49.41966
249	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 13:31:58.468825
250	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 13:32:03.431198
251	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 13:40:50.577674
252	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-16 13:47:11.951907
253	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-16 13:52:22.412298
254	4	AUTHORITY_DELETED	user	21	{"email": "drainage.anna.university@echo.gov", "fullName": "anna university Drainage Officer"}	::1	2026-03-16 14:01:47.541013
255	4	AUTHORITY_DELETED	user	23	{"email": "garbage.anna.university@echo.gov", "fullName": "anna university Garbage Officer"}	::1	2026-03-16 14:02:07.274801
256	4	AUTHORITY_DELETED	user	22	{"email": "pothole.anna.university@echo.gov", "fullName": "anna university Pothole Officer"}	::1	2026-03-16 14:02:11.919673
257	4	AUTHORITY_CREATED	user	31	{"email": "drainage.anna.university@echo.gov", "wardId": 1, "department": "Drainage", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-16 14:07:20.863467
258	31	USER_LOGIN	user	31	{"email": "drainage.anna.university@echo.gov"}	::1	2026-03-16 14:07:59.272944
259	4	AUTHORITY_CREATED	user	41	{"email": "drainage.head@echo.gov", "wardId": 1, "department": "Drainage", "authorityLevel": "DEPARTMENT", "jurisdictionId": null}	::1	2026-03-16 14:42:10.031494
260	41	USER_LOGIN	user	41	{"email": "drainage.head@echo.gov"}	::1	2026-03-16 14:42:30.041115
261	4	JURISDICTION_CREATED	jurisdiction	6	{"name": "trichy"}	::1	2026-03-16 15:05:33.267293
262	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-16 15:12:11.95219
263	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-17 12:22:05.684991
264	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-17 12:22:56.207179
266	41	USER_LOGIN	user	41	{"email": "drainage.head@echo.gov"}	::1	2026-03-17 14:30:11.581266
269	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-17 15:29:07.016661
271	4	AUTHORITY_CREATED	authority	13	{"email": "pothole.anna.university@echo.gov", "categoryId": "1", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-17 15:34:47.298798
272	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-03-17 15:35:08.93755
273	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-17 15:35:42.33891
275	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-18 09:34:39.995524
276	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-18 09:35:32.983833
278	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-18 11:00:37.530346
280	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-03-18 11:02:45.438111
281	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-03-18 11:42:17.277597
282	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-03-18 11:43:01.645784
283	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-20 10:09:09.128247
284	4	AUTHORITY_CREATED	authority	14	{"email": "garbage.rayavaram@echo.gov", "categoryId": "3", "authorityLevel": "JURISDICTION", "jurisdictionId": "2"}	::1	2026-03-20 10:11:04.656857
285	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-20 10:11:31.833349
286	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-20 10:58:06.096981
287	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-20 10:58:23.575898
289	14	AUTHORITY_LOGIN	authority	14	{"email": "garbage.rayavaram@echo.gov"}	::1	2026-03-20 11:26:45.521787
290	10	AUTHORITY_LOGIN	authority	10	{"email": "garbage.dept@echo.gov"}	::1	2026-03-20 11:28:04.751184
291	14	AUTHORITY_LOGIN	authority	14	{"email": "garbage.rayavaram@echo.gov"}	::1	2026-03-20 11:47:22.467877
292	14	AUTHORITY_LOGIN	authority	14	{"email": "garbage.rayavaram@echo.gov"}	::1	2026-03-20 11:48:38.986953
293	4	AUTHORITY_DELETED	authority	14	{"email": "garbage.rayavaram@echo.gov", "fullName": "Rayavaram Garbage Officer"}	::1	2026-03-20 12:09:32.447125
294	4	AUTHORITY_CREATED	authority	15	{"email": "garbage.rayavaram@echo.gov", "categoryId": "3", "authorityLevel": "JURISDICTION", "jurisdictionId": "2"}	::1	2026-03-20 12:10:28.491662
298	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-03-20 12:55:22.76315
299	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-24 07:27:56.14328
300	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-24 07:29:20.236545
302	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-24 07:37:35.534683
306	4	AUTHORITY_DELETED	authority	1	{"email": "drainage.anna.university@echo.gov", "fullName": "anna university Drainage Officer"}	::1	2026-03-24 10:38:17.886905
308	9	AUTHORITY_LOGIN	authority	9	{"email": "streetlight.dept@echo.gov"}	::1	2026-03-24 10:55:32.325959
309	9	AUTHORITY_LOGIN	authority	9	{"email": "streetlight.dept@echo.gov"}	::1	2026-03-24 11:00:19.105534
311	12	AUTHORITY_LOGIN	authority	12	{"email": "encroachment.dept@echo.gov"}	::1	2026-03-24 15:58:30.507466
314	9	AUTHORITY_LOGIN	authority	9	{"email": "streetlight.dept@echo.gov"}	::1	2026-03-24 16:08:26.663412
318	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-24 16:18:47.447755
319	12	AUTHORITY_LOGIN	authority	12	{"email": "encroachment.dept@echo.gov"}	::1	2026-03-24 16:19:45.756033
320	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-24 16:20:18.771947
323	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-25 08:07:19.066179
324	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-25 08:08:08.655717
326	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-25 08:37:58.67436
327	25	COMPLAINT_SUBMITTED	complaint	8	{"issueId": 2, "isPrimary": false, "assignedTo": 7, "categoryId": "4"}	::1	2026-03-25 08:53:40.989137
328	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-25 19:22:10.346384
329	25	COMPLAINT_SUBMITTED	complaint	9	{"issueId": 2, "isPrimary": false, "assignedTo": 7, "categoryId": "4"}	::1	2026-03-25 19:22:47.548488
330	25	COMPLAINT_SUBMITTED	complaint	10	{"issueId": 3, "isPrimary": true, "assignedTo": 2, "categoryId": "4"}	::1	2026-03-25 19:37:54.171031
332	5	COMPLAINT_SUBMITTED	complaint	11	{"issueId": 4, "isPrimary": true, "assignedTo": 15, "categoryId": "3"}	::1	2026-03-25 20:08:13.52543
391	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-09 09:57:16.735356
334	25	COMPLAINT_SUBMITTED	complaint	12	{"issueId": 4, "isPrimary": false, "assignedTo": 15, "categoryId": "3"}	::1	2026-03-25 20:21:10.980885
335	4	AUTHORITY_CREATED	authority	16	{"email": "encroachment.rayavaram@echo.gov", "categoryId": "6", "authorityLevel": "JURISDICTION", "jurisdictionId": "2"}	::1	2026-03-25 21:50:49.873311
336	5	COMPLAINT_SUBMITTED	complaint	13	{"issueId": 5, "isPrimary": true, "assignedTo": 16, "categoryId": "6"}	::1	2026-03-25 21:51:24.088719
339	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-26 09:23:51.768812
340	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-26 09:24:37.534137
341	5	COMPLAINT_SUBMITTED	complaint	14	{"issueId": 6, "isPrimary": true, "assignedTo": 13, "categoryId": "1"}	::1	2026-03-26 09:29:04.990574
342	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-26 09:29:32.595448
343	25	COMPLAINT_SUBMITTED	complaint	15	{"issueId": 6, "isPrimary": false, "assignedTo": 13, "categoryId": "1"}	::1	2026-03-26 09:30:04.800842
344	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-03-26 09:31:00.10136
345	13	ISSUE_LOCATION_UPDATED	issue	6	{"address": "Trichy Road, Kolikkaranchattram, Kulathur taluk, 622504", "latitude": 10.65518088645266, "longitude": 78.74473214149477, "landmark_note": "c block"}	::1	2026-03-26 09:37:05.887892
346	13	ISSUE_VERIFIED	issue	6	{"action": "accept"}	::1	2026-03-26 09:40:52.22881
347	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-27 10:37:30.82611
348	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-03-27 10:50:32.912999
349	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-27 13:38:06.789837
350	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-03-27 13:38:14.041449
351	4	AUTHORITY_CREATED	authority	17	{"email": "streetlight.anna.university@echo.gov", "categoryId": "2", "authorityLevel": "JURISDICTION", "jurisdictionId": "4"}	::1	2026-03-27 13:44:02.394363
353	5	COMPLAINT_SUBMITTED	complaint	16	{"issueId": 7, "isPrimary": true, "assignedTo": 17, "categoryId": "2"}	::1	2026-03-27 13:49:11.571749
354	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-03-27 13:49:58.326077
355	25	COMPLAINT_SUBMITTED	complaint	17	{"issueId": 8, "isPrimary": true, "assignedTo": 7, "categoryId": "4"}	::1	2026-03-27 13:51:11.182751
356	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-02 19:46:42.429589
357	5	COMPLAINT_SUBMITTED	complaint	18	{"issueId": 9, "isPrimary": true, "assignedTo": 7, "categoryId": "4"}	::1	2026-04-02 19:49:02.404108
358	5	COMPLAINT_SUBMITTED	complaint	19	{"issueId": 10, "isPrimary": true, "assignedTo": 7, "categoryId": "4"}	::1	2026-04-02 20:02:16.011554
359	5	COMPLAINT_SUBMITTED	complaint	20	{"issueId": 11, "isPrimary": true, "assignedTo": 7, "categoryId": "4"}	::1	2026-04-02 20:10:01.490887
360	5	COMPLAINT_SUBMITTED	complaint	21	{"issueId": 12, "isPrimary": true, "assignedTo": 7, "categoryId": "4"}	::1	2026-04-02 20:10:41.983267
361	\N	SLA_BREACH	issue	2	{"breach_time": "2026-04-02T14:50:00.627Z", "auto_detected": true}	system	2026-04-02 20:20:00.603382
362	\N	SLA_BREACH	issue	3	{"breach_time": "2026-04-02T14:50:00.637Z", "auto_detected": true}	system	2026-04-02 20:20:00.603382
363	\N	SLA_BREACH	issue	4	{"breach_time": "2026-04-02T14:50:00.639Z", "auto_detected": true}	system	2026-04-02 20:20:00.603382
364	\N	SLA_BREACH	issue	6	{"breach_time": "2026-04-02T14:50:00.641Z", "auto_detected": true}	system	2026-04-02 20:20:00.603382
365	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-03 18:29:15.023681
366	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-05 09:38:00.089583
367	\N	SLA_BREACH	issue	7	{"breach_time": "2026-04-05T05:40:00.550Z", "auto_detected": true}	system	2026-04-05 11:10:00.533728
368	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-05 11:33:37.089102
371	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-06 19:37:53.352889
372	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-06 19:59:44.084026
374	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-04-06 20:01:06.749075
376	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-07 11:28:10.472872
377	5	COMPLAINT_SUBMITTED	complaint	22	{"issueId": 14, "distance": 0, "isPrimary": true, "assignedTo": 7, "categoryId": "3", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-07 11:30:11.482737
378	5	COMPLAINT_SUBMITTED	complaint	23	{"issueId": 15, "distance": 0, "isPrimary": true, "assignedTo": 2, "categoryId": "4", "reportMode": "remote", "trustLevel": "high"}	::1	2026-04-07 12:03:05.588385
379	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-07 12:33:00.891685
380	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-07 13:49:55.355777
381	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-07 13:50:47.746126
383	13	AUTHORITY_LOGIN	authority	13	{"email": "pothole.anna.university@echo.gov"}	::1	2026-04-07 13:52:04.380604
384	\N	SLA_BREACH	issue	14	{"breach_time": "2026-04-09T02:15:00.694Z", "auto_detected": true}	system	2026-04-09 07:45:00.662054
385	\N	SLA_BREACH	issue	5	{"breach_time": "2026-04-09T02:15:00.697Z", "auto_detected": true}	system	2026-04-09 07:45:00.662054
386	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-09 08:06:40.865474
387	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-04-09 09:30:11.744609
388	24	COMPLAINT_SUBMITTED	complaint	24	{"issueId": 15, "distance": 0, "isPrimary": false, "assignedTo": 2, "categoryId": "4", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-09 09:49:06.231582
392	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-09 15:23:34.195995
393	\N	SLA_BREACH	issue	15	{"breach_time": "2026-04-09T09:55:00.618Z", "auto_detected": true}	system	2026-04-09 15:25:00.376138
394	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-10 11:56:01.952013
395	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-10 11:56:30.020652
396	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-10 12:15:28.254434
397	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-04-10 12:31:54.667649
398	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-13 21:48:13.371072
399	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-14 06:27:10.938149
407	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-14 16:36:50.175506
408	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-14 17:10:16.919818
409	24	USER_LOGIN	user	24	{"email": "citizen1@gmail.com"}	::1	2026-04-14 17:37:00.781276
410	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-16 07:50:26.375673
411	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-20 10:28:30.216783
412	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-20 10:32:04.491032
413	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 08:37:21.750056
414	5	COMPLAINT_SUBMITTED	complaint	25	{"issueId": 16, "distance": 0, "isPrimary": true, "assignedTo": 15, "categoryId": "3", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-21 08:41:36.853485
415	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 08:42:44.676747
416	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-21 08:43:15.195842
419	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 08:49:35.952775
420	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 09:32:11.941683
421	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 09:50:33.146584
422	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 09:52:10.920105
423	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-21 17:42:52.374044
424	5	COMPLAINT_SUBMITTED	complaint	26	{"issueId": 17, "distance": 0, "isPrimary": true, "assignedTo": 2, "categoryId": "4", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-21 17:43:50.195474
425	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-04-21 17:44:49.508742
426	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-22 07:38:30.264719
428	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-22 07:41:04.928887
429	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-04-22 07:41:50.938543
430	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-04-22 07:43:27.77769
431	25	COMPLAINT_SUBMITTED	complaint	27	{"issueId": 17, "distance": 20, "isPrimary": false, "assignedTo": 2, "categoryId": "4", "reportMode": "remote", "trustLevel": "high"}	::1	2026-04-22 07:44:42.417653
434	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-23 14:56:32.568619
438	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-23 16:58:55.427453
439	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-23 17:15:16.62802
440	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-23 17:28:57.582681
441	5	COMPLAINT_SUBMITTED	complaint	21	{"issueId": 11, "distance": 0, "isPrimary": true, "assignedTo": 15, "categoryId": "3", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-23 17:30:18.767784
442	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-23 17:30:55.756113
444	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-24 06:49:21.11843
445	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-24 06:54:16.418891
446	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-24 07:15:51.990946
447	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-24 07:16:15.902036
448	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-24 07:25:18.543715
449	5	COMPLAINT_SUBMITTED	complaint	22	{"issueId": 12, "distance": 0, "isPrimary": true, "assignedTo": 8, "categoryId": "1", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-24 07:51:43.379779
451	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-04-24 07:54:52.064017
452	25	COMPLAINT_SUBMITTED	complaint	23	{"issueId": 12, "distance": 0, "isPrimary": false, "assignedTo": 8, "categoryId": "1", "reportMode": "in_place", "trustLevel": "high"}	::1	2026-04-24 07:58:46.739472
453	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-24 08:03:22.038635
454	25	USER_LOGIN	user	25	{"email": "citizen2@gmail.com"}	::1	2026-04-24 08:46:02.16236
455	\N	SLA_BREACH	issue	11	{"breach_time": "2026-04-24T14:40:01.120Z", "auto_detected": true}	system	2026-04-24 20:10:00.979552
456	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-25 15:58:03.039352
458	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-25 16:15:00.862727
459	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-25 16:15:23.208127
461	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-26 08:31:19.592001
462	\N	SLA_BREACH	issue	12	{"breach_time": "2026-04-27T03:40:01.021Z", "auto_detected": true}	system	2026-04-27 09:10:00.920214
463	4	USER_LOGIN	user	4	{"email": "admin@echo.gov"}	::1	2026-04-27 09:14:48.101457
464	5	USER_LOGIN	user	5	{"email": "aravinthviswa4@gmail.com"}	::1	2026-04-27 09:15:16.314306
\.


--
-- Data for Name: authorities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.authorities (id, email, password_hash, full_name, phone, authority_level, jurisdiction_id, category_id, department, is_active, created_at, updated_at) FROM stdin;
2	drainage.head@echo.gov	$2b$10$H25D7IUEtfG9pgrZ/5rW1OsO4HRmhuqdMFbNnzH7jNs7qFsfLVRWy	Drainage Department Head	\N	DEPARTMENT	\N	4	Drainage	t	2026-03-16 14:42:10.022191	2026-03-17 12:35:14.380874
8	pothole.dept@echo.gov	$2b$10$i3E/MpML/bfIuKfwo6pabeCoDLNN0hDNpbnjoBPf.Fy0pYyKgg8V2	Pothole Department Head	\N	DEPARTMENT	\N	1	Pothole Department	t	2026-03-17 15:08:48.548277	2026-03-17 15:08:48.548277
9	streetlight.dept@echo.gov	$2b$10$i3E/MpML/bfIuKfwo6pabeCoDLNN0hDNpbnjoBPf.Fy0pYyKgg8V2	Streetlight Department Head	\N	DEPARTMENT	\N	2	Streetlight Department	t	2026-03-17 15:08:48.556633	2026-03-17 15:08:48.556633
10	garbage.dept@echo.gov	$2b$10$i3E/MpML/bfIuKfwo6pabeCoDLNN0hDNpbnjoBPf.Fy0pYyKgg8V2	Garbage Department Head	\N	DEPARTMENT	\N	3	Garbage Department	t	2026-03-17 15:08:48.558489	2026-03-17 15:08:48.558489
11	water.supply.dept@echo.gov	$2b$10$i3E/MpML/bfIuKfwo6pabeCoDLNN0hDNpbnjoBPf.Fy0pYyKgg8V2	Water Supply Department Head	\N	DEPARTMENT	\N	5	Water Supply Department	t	2026-03-17 15:08:48.560518	2026-03-17 15:08:48.560518
12	encroachment.dept@echo.gov	$2b$10$i3E/MpML/bfIuKfwo6pabeCoDLNN0hDNpbnjoBPf.Fy0pYyKgg8V2	Encroachment Department Head	\N	DEPARTMENT	\N	6	Encroachment Department	t	2026-03-17 15:08:48.562171	2026-03-17 15:08:48.562171
13	pothole.anna.university@echo.gov	$2b$10$fGwzjHFR1RJhw9UawK4FDeM5EjehXyDf05z9XeOtJSmyMYzKhFtH2	anna university Pothole Officer	\N	JURISDICTION	4	1	Pothole - anna university	t	2026-03-17 15:34:47.293334	2026-03-17 15:34:47.293334
15	garbage.rayavaram@echo.gov	$2b$10$t1rofd/zFsEARbJr2NTi/eaovuF/DtEvPu/4BsmqX2Tp4LABCqCqS	Rayavaram Garbage Officer	\N	JURISDICTION	2	3	Garbage - Rayavaram	t	2026-03-20 12:10:28.486771	2026-03-20 12:10:28.486771
16	encroachment.rayavaram@echo.gov	$2b$10$II6pn69Ky0L6qN.R0bdi1uJoRoT6NZH5sUe474P5OXPx3NgMYuPOu	Rayavaram Encroachment Officer	\N	JURISDICTION	2	6	Encroachment - Rayavaram	t	2026-03-25 21:50:49.867795	2026-03-25 21:50:49.867795
17	streetlight.anna.university@echo.gov	$2b$10$Yam5XB1Uxo4kIvuxHaAQoeb7uZhtm2nCgQM6tdTj7DaOzhyz47B5a	anna university Streetlight Officer	\N	JURISDICTION	4	2	Streetlight - anna university	t	2026-03-27 13:44:02.384225	2026-03-27 13:44:02.384225
7	superadmin@echo.gov	$2b$10$JxaK2KgNvKMZr9lLbnzhCu3IgfXHfoBj7.XWh2MrgwSwp2zXMOzfe	Super Administrator	\N	SUPER_ADMIN	\N	\N	Administration	t	2026-03-17 12:35:14.473579	2026-03-17 12:35:14.473579
\.


--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categories (id, name, description, aggregation_radius_meters, aggregation_time_window_hours, sla_hours, created_at) FROM stdin;
1	Pothole	Road damage and potholes	50	72	72	2026-03-16 14:02:57.43241
2	Streetlight	Non-functional or damaged streetlights	30	48	48	2026-03-16 14:02:57.43241
3	Garbage	Uncollected garbage or illegal dumping	100	24	24	2026-03-16 14:02:57.43241
5	Water Supply	Water leakage or supply issues	75	48	12	2026-03-17 13:18:49.344238
4	Drainage	Blocked drains or sewage issues	80	48	48	2026-03-16 14:02:57.43241
6	Encroachment	Illegal construction or encroachment	50	168	168	2026-03-17 13:18:49.344238
\.


--
-- Data for Name: complaint_routing_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.complaint_routing_logs (id, complaint_id, issue_id, routed_to_user_id, authority_level, authority_email, authority_name, jurisdiction_id, jurisdiction_name, category_id, category_name, routing_reason, echo_count, routed_at, routing_details, routed_to_authority_id) FROM stdin;
54	21	11	\N	JURISDICTION	garbage.rayavaram@echo.gov	Rayavaram Garbage Officer	2	Rayavaram	3	Garbage	NORMAL	1	2026-04-23 17:30:17.351858	{"distance": 0, "isPrimary": true, "reportMode": "in_place", "trustLevel": "high", "coordinates": {"latitude": 10.21795, "longitude": 78.8195017}, "submittedBy": 5, "reporterCoordinates": {"latitude": 10.21795, "longitude": 78.8195017}, "routedToAuthorityId": 15, "originalRoutingReason": "NORMAL"}	15
55	22	12	\N	DEPARTMENT	pothole.dept@echo.gov	Pothole Department Head	2	Rayavaram	1	Pothole	JURISDICTION_FALLBACK	1	2026-04-24 07:51:40.809594	{"distance": 0, "isPrimary": true, "reportMode": "in_place", "trustLevel": "high", "coordinates": {"latitude": 10.22091, "longitude": 78.8197417}, "submittedBy": 5, "reporterCoordinates": {"latitude": 10.22091, "longitude": 78.8197417}, "routedToAuthorityId": 8, "originalRoutingReason": "NO_JURISDICTION_AUTHORITY"}	8
56	23	12	\N	DEPARTMENT	pothole.dept@echo.gov	Pothole Department Head	2	Rayavaram	1	Pothole	JURISDICTION_FALLBACK	2	2026-04-24 07:58:43.891137	{"distance": 0, "isPrimary": false, "reportMode": "in_place", "trustLevel": "high", "coordinates": {"latitude": 10.2209083, "longitude": 78.819745}, "submittedBy": 25, "reporterCoordinates": {"latitude": 10.2209083, "longitude": 78.819745}, "routedToAuthorityId": 8, "originalRoutingReason": "NO_JURISDICTION_AUTHORITY"}	8
57	21	11	\N	DEPARTMENT	garbage.dept@echo.gov	Garbage Department Head	2	Rayavaram	3	Garbage	SLA_ESCALATION	1	2026-04-26 08:29:40.171258	{"escalationLevel": 1, "escalationReason": "Auto-escalation (normal priority): 62 hours without action", "previousAuthorityId": 15, "routedToAuthorityId": 10, "originalRoutingReason": "SLA_ESCALATION"}	10
58	22	12	\N	SUPER_ADMIN	superadmin@echo.gov	Super Administrator	2	Rayavaram	1	Pothole	SLA_ESCALATION	2	2026-04-26 08:29:40.339617	{"escalationLevel": 1, "escalationReason": "Auto-escalation (normal priority): 48 hours without action", "previousAuthorityId": 8, "routedToAuthorityId": 7, "originalRoutingReason": "SLA_ESCALATION"}	7
59	21	11	\N	SUPER_ADMIN	superadmin@echo.gov	Super Administrator	2	Rayavaram	3	Garbage	SLA_ESCALATION	1	2026-04-26 08:47:24.618182	{"escalationLevel": 2, "escalationReason": "Auto-escalation (normal priority): 63 hours without action", "previousAuthorityId": 10, "routedToAuthorityId": 7, "originalRoutingReason": "SLA_ESCALATION"}	7
\.


--
-- Data for Name: complaints; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.complaints (id, issue_id, user_id, category_id, location, latitude, longitude, evidence_url, evidence_type, description, is_primary, status, created_at, jurisdiction_id, assigned_to, escalated_to, escalation_level, escalated_at, updated_at, assigned_authority_id, escalated_authority_id, routing_reason, reporter_location, reporter_latitude, reporter_longitude, distance_meters, trust_level, remote_justification, justification_type, location_verification_status, report_mode, image_hash, validation_status, location_confidence, duplicate_of, metadata_validation) FROM stdin;
22	12	5	1	0101000020E6100000B72AE4A576B45340FEB7921D1B712440	10.22091000	78.81974170	/uploads/1776997282391-537855081.jpg	photo	There is a worst road across our village road .so it cause a risk to the people who ride.	t	assigned	2026-04-24 07:51:40.809594	2	\N	\N	1	2026-04-26 08:29:40.339617	2026-04-24 07:51:40.809594	7	7	SLA_ESCALATION	0101000020E6100000B72AE4A576B45340FEB7921D1B712440	10.22091000	78.81974170	0	high	\N	\N	verified	in_place	\N	VALID	LOW	\N	{"validatedAt": "2026-04-24T02:21:43.347Z", "validationResults": {"image": null, "overall": {"error": "validationResults is not defined", "status": "VALID", "message": "Validation failed but allowing submission", "canProceed": true, "confidence": "LOW"}, "location": null, "metadata": null, "duplicate": null, "timestamp": "2026-04-24T02:21:43.308Z"}}
23	12	25	1	0101000020E6100000CF83BBB376B4534075D487E41A712440	10.22090830	78.81974500	/uploads/1776997712716-178124558.jpg	photo	In my area ,the roads are get damaged due to the unlawful act of contractors . Our people is complaint several times yet the action is not taken by officials.	f	assigned	2026-04-24 07:58:43.891137	2	\N	\N	0	\N	2026-04-24 07:58:43.891137	7	\N	NO_JURISDICTION_AUTHORITY	0101000020E6100000CF83BBB376B4534075D487E41A712440	10.22090830	78.81974500	0	high	\N	\N	verified	in_place	\N	VALID	LOW	\N	{"validatedAt": "2026-04-24T02:28:46.721Z", "validationResults": {"image": null, "overall": {"error": "validationResults is not defined", "status": "VALID", "message": "Validation failed but allowing submission", "canProceed": true, "confidence": "LOW"}, "location": null, "metadata": null, "duplicate": null, "timestamp": "2026-04-24T02:28:46.706Z"}}
21	11	5	3	0101000020E61000000D2142B772B453408F537424976F2440	10.21795000	78.81950170	/uploads/1776945606460-991539336.jpg	photo	Garbage is not properly managed in this area	t	assigned	2026-04-23 17:30:17.351858	2	\N	\N	2	2026-04-26 08:47:24.618182	2026-04-23 17:30:17.351858	7	7	SLA_ESCALATION	0101000020E61000000D2142B772B453408F537424976F2440	10.21795000	78.81950170	0	high	\N	\N	verified	in_place	\N	VALID	LOW	\N	{"validatedAt": "2026-04-23T12:00:18.746Z", "validationResults": {"image": null, "overall": {"error": "validationResults is not defined", "status": "VALID", "message": "Validation failed but allowing submission", "canProceed": true, "confidence": "LOW"}, "location": null, "metadata": null, "duplicate": null, "timestamp": "2026-04-23T12:00:18.726Z"}}
\.


--
-- Data for Name: image_hashes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.image_hashes (id, complaint_id, image_hash, created_at) FROM stdin;
\.


--
-- Data for Name: issues; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.issues (id, category_id, location, ward_id, status, echo_count, first_reported_at, last_reported_at, verified_at, verified_by, resolved_at, resolved_by, resolution_proof_url, created_at, updated_at, jurisdiction_id, verified_by_authority_id, resolved_by_authority_id, verified_address, landmark_note, sla_duration_hours, sla_deadline, is_sla_breached, escalated_at, escalation_reason) FROM stdin;
11	3	0101000020E61000000D2142B772B453408F537424976F2440	\N	pending	1	2026-04-23 17:30:17.351858	2026-04-23 17:30:17.351858	\N	\N	\N	\N	\N	2026-04-23 17:30:17.351858	2026-04-24 20:10:00.979552	2	\N	\N	\N	\N	24	2026-04-24 17:30:18.742	t	\N	\N
12	1	0101000020E6100000B72AE4A576B45340FEB7921D1B712440	\N	pending	2	2026-04-24 07:51:40.809594	2026-04-24 07:58:43.891137	\N	\N	\N	\N	\N	2026-04-24 07:51:40.809594	2026-04-27 09:10:00.920214	2	\N	\N	\N	\N	72	2026-04-27 07:51:43.337	t	\N	\N
3	3	0101000020E610000052B81E85EB115440AE47E17A142E2A40	\N	resolved	2	2026-04-18 15:06:25.972482	2026-04-20 15:06:25.972482	\N	\N	\N	\N	\N	2026-04-23 15:06:25.972482	2026-04-23 15:06:25.972482	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
4	1	0101000020E6100000295C8FC2F51054406666666666262A40	\N	in_progress	4	2026-04-20 15:06:25.972482	2026-04-21 15:06:25.972482	\N	\N	\N	\N	\N	2026-04-23 15:06:25.972482	2026-04-23 15:06:25.972482	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
5	4	0101000020E61000001361C3D32B3D5340462575029A082640	\N	verified	2	2026-04-19 15:06:26.074502	2026-04-20 15:06:26.074502	\N	\N	\N	\N	\N	2026-04-23 15:06:26.074502	2026-04-23 15:06:26.074502	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
6	5	0101000020E61000003D0AD7A3703D53400AD7A3703D0A2640	\N	pending	1	2026-04-21 15:06:26.074502	2026-04-21 15:06:26.074502	\N	\N	\N	\N	\N	2026-04-23 15:06:26.074502	2026-04-23 15:06:26.074502	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
1	1	0101000020E6100000BEC117265311544027C286A7572A2A40	\N	verified	3	2026-04-21 15:06:25.972482	2026-04-22 15:06:25.972482	\N	\N	\N	\N	\N	2026-04-23 15:06:25.972482	2026-04-23 15:06:25.972482	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
2	2	0101000020E61000009A99999999115440EC51B81E852B2A40	\N	pending	1	2026-04-22 15:06:25.972482	2026-04-22 15:06:25.972482	\N	\N	\N	\N	\N	2026-04-23 15:06:25.972482	2026-04-23 15:06:25.972482	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
7	2	0101000020E6100000CDCCCCCCCC3C534085EB51B81E052640	\N	resolved	3	2026-04-17 15:06:26.074502	2026-04-19 15:06:26.074502	\N	\N	\N	\N	\N	2026-04-23 15:06:26.074502	2026-04-23 15:06:26.074502	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
8	6	0101000020E6100000E4839ECDAA875340B6847CD0B3D92340	\N	verified	1	2026-04-22 15:06:26.076152	2026-04-22 15:06:26.076152	\N	\N	\N	\N	\N	2026-04-23 15:06:26.076152	2026-04-23 15:06:26.076152	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
9	1	0101000020E610000000000000008853405C8FC2F528DC2340	\N	pending	2	2026-04-20 15:06:26.076152	2026-04-21 15:06:26.076152	\N	\N	\N	\N	\N	2026-04-23 15:06:26.076152	2026-04-23 15:06:26.076152	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
10	3	0101000020E61000008FC2F5285C875340D7A3703D0AD72340	\N	in_progress	1	2026-04-18 15:06:26.076152	2026-04-19 15:06:26.076152	\N	\N	\N	\N	\N	2026-04-23 15:06:26.076152	2026-04-23 15:06:26.076152	\N	\N	\N	\N	\N	\N	\N	f	\N	\N
\.


--
-- Data for Name: jurisdictions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.jurisdictions (id, name, boundary, area_sq_meters, created_at, updated_at) FROM stdin;
1	bengaluru	0103000020E610000001000000060000000D8AE6012C6653402906483481022A403C8386FE096A534049F3C7B436E529402B357BA015645340CA52EBFD46DB29408196AE601B6253404E0E9F7422012A40552E54FEB56353408FC4CBD3B90A2A400D8AE6012C6653402906483481022A40	74399658.264112	2026-03-09 18:51:22.947811	2026-03-09 18:51:22.947811
2	Rayavaram	0103000020E6100000010000000600000053EA92718CB353404DBB9866BA872440465D6BEF53B7534082C476F7007D244083F8C08EFFB65340EDD79DEE3C612440E3A7716F7EB2534005A4FD0FB066244084F23E8EE6B15340849A2155147F244053EA92718CB353404DBB9866BA872440	57022382.21337724	2026-03-09 20:07:57.679851	2026-03-09 20:07:57.679851
3	vellanur	0103000020E6100000010000000500000031EF71A609B353409BE7887C97EA24402CF015DD7AB353405587DC0C37E82440070B2769FEB253403239B5334CE5244046425BCEA5B25340D0436D1B46E9244031EF71A609B353409BE7887C97EA2440	822758.21811831	2026-03-10 07:58:46.40949	2026-03-10 07:58:46.40949
4	anna university	0103000020E610000001000000060000006956B60F79AE534037177FDB135C2540D4449F8F32B153409581035ABA622540A94BC63192B15340B439CE6DC23D2540365CE49EAEAC53405932C7F2AE422540D15966118AAC5340DAACFA5C6D5525406956B60F79AE534037177FDB135C2540	50481898.94876808	2026-03-10 13:34:29.705567	2026-03-10 13:34:29.705567
6	trichy	0103000020E610000001000000050000005531957EC2A95340897D022846C6254043C5387F13B35340465B9544F6A9254089EDEE01BAAA534067D47C957C6C25407E54C37E4FA453408997A77345A925405531957EC2A95340897D022846C62540	244811605.69623375	2026-03-16 15:05:33.089472	2026-03-16 15:05:33.089472
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notifications (id, user_id, title, message, type, is_read, complaint_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- Data for Name: user_rate_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_rate_limits (id, user_id, submission_date, hourly_count, daily_count, last_submission, created_at, updated_at) FROM stdin;
1	5	2026-04-21	1	2	2026-04-21 17:43:41.601	2026-04-21 08:39:31.26442	2026-04-21 17:43:41.610376
3	25	2026-04-21	2	2	2026-04-21 17:46:22.948	2026-04-21 17:46:04.228801	2026-04-21 17:46:22.95308
5	25	2026-04-22	1	1	2026-04-22 07:44:41.589	2026-04-22 07:44:41.590582	2026-04-22 07:44:41.600664
6	5	2026-04-23	1	1	2026-04-23 17:30:06.407	2026-04-23 17:30:06.411014	2026-04-23 17:30:06.420324
7	5	2026-04-24	1	1	2026-04-24 07:51:22.342	2026-04-24 07:51:22.343615	2026-04-24 07:51:22.360458
8	25	2026-04-24	1	1	2026-04-24 07:58:32.703	2026-04-24 07:58:32.704245	2026-04-24 07:58:32.707049
\.


--
-- Data for Name: user_reporting_limits; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_reporting_limits (id, user_id, report_date, report_count, low_trust_count, created_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (id, email, password_hash, role, full_name, phone, ward_id, is_active, created_at, updated_at) FROM stdin;
41	drainage.head@echo.gov	$2b$10$H25D7IUEtfG9pgrZ/5rW1OsO4HRmhuqdMFbNnzH7jNs7qFsfLVRWy	authority	Drainage Department Head	\N	1	t	2026-03-16 14:42:10.022191	2026-03-16 14:42:10.022191
5	aravinthviswa4@gmail.com	$2b$10$5tQh0Ec8W3tHIY6n507F6eHCZLTIg9lFGQgcoN2Ptnzmf/9DCXel6	citizen	Aravinth Viswanathan	09080968033	\N	t	2026-02-09 19:02:35.449782	2026-02-09 19:02:35.449782
9	drainage@echo.gov	$2b$10$WzW3d7X2s/l9uAExACNRTuvosf14oJ8KxWkXblvl7etI0gt0i62IC	authority	Drainage Department	\N	1	t	2026-02-19 05:17:26.318982	2026-02-19 05:17:26.318982
10	sarathiraj7@gmail.com	$2b$10$opptNE3/obhr.z22ALff3eAypBMrVkBRZVCCFB3IJEK0RJ0E/AmtO	citizen	sarathiraj	123456789	\N	t	2026-02-19 05:22:22.147454	2026-02-19 05:22:22.147454
11	sarathi2@gmail.com	$2b$10$evyOJ2fkmLSH3RXucUyHWesxVlD6qw48.zIxKLZyfGfblgT.dYuxm	citizen	sarathi	123456789	\N	t	2026-02-19 05:23:41.007414	2026-02-19 05:23:41.007414
12	pothole@echo.gov	$2b$10$iFkzsgw3UBSbKQHgNkwbsO9YoiFYKEVeZEl17DZ4ZbUQN1fslEAie	authority	Pothole Department	\N	1	t	2026-02-19 06:01:31.990492	2026-02-19 06:01:31.990492
13	streetlight@echo.gov	$2b$10$1j1Rywn8VmRIcXgG8SAdaOjPlaI4yLXIa6ofjp/6IFFLksbXQbO4e	authority	Streetlight Department	\N	1	t	2026-02-19 06:01:32.096394	2026-02-19 06:01:32.096394
14	garbage@echo.gov	$2b$10$/YGsHXOZ/PS49n0ErAsX5udmJAF3xSqNblF2E7VxwZWFLQR/0HoM.	authority	Garbage Department	\N	1	t	2026-02-19 06:01:32.194615	2026-02-19 06:01:32.194615
18	pothole.rayavaram@echo.gov	$2b$10$kOdUtKdDwwts5qB/Y9SKd.61wm2tUV2Lcoo8Wnd5i6FLhacetHMoS	authority	Rayavaram Pothole Officer	\N	1	t	2026-03-09 22:41:25.612026	2026-03-09 22:41:25.612026
19	garbage.vellanur@echo.gov	$2b$10$xuTsbAu.Dn92qHT2xvoNZOqLOlZP5uu.pSxjZDLnsSKlUXQpOX87i	authority	vellanur Garbage Officer	\N	1	t	2026-03-10 08:00:08.958161	2026-03-10 08:00:08.958161
20	mahicitizen@gmail.com	$2b$10$WTYJkbA.8WnQuDwyB6J2y.QNMTr8W.5khYfsKJBJwRr6xHr4VJD6y	citizen	dhoni	9080968038	\N	t	2026-03-10 11:55:43.852591	2026-03-10 11:55:43.852591
24	citizen1@gmail.com	$2b$10$bw.Bj/OzGKDeaiINxFpTE.EHO1J7NMreuxY/yoS91fx3vzuYohkKG	citizen	citizen 1	9080968039	\N	t	2026-03-13 10:35:05.189517	2026-03-13 10:35:05.189517
25	citizen2@gmail.com	$2b$10$wZ9zR9RwqyFWS5m1eNfNOuojprCG8WE3DGjuERe8LAgE/0VEzeS/S	citizen	citizen 2	0908096803	\N	t	2026-03-13 12:57:54.696619	2026-03-13 12:57:54.696619
4	admin@echo.gov	$2b$10$nZW1fDD11VqjmnxARhrQ5eAmViIQh7YC/JVAg44x40aP2fFFpLc0C	admin	System Admin	9999999999	\N	t	2026-02-09 10:56:05.178654	2026-04-25 15:57:13.425225
31	drainage.anna.university@echo.gov	$2b$10$4/wf0xJknY/wXdPG.yKibe8mCP4wcgDHRTWCGlJREx6vJw5oyuBmC	authority	anna university Drainage Officer	\N	1	t	2026-03-16 14:07:20.852393	2026-03-16 14:07:20.852393
\.


--
-- Name: audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.audit_logs_id_seq', 465, true);


--
-- Name: authorities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.authorities_id_seq', 17, true);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 6, true);


--
-- Name: complaint_routing_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.complaint_routing_logs_id_seq', 59, true);


--
-- Name: complaints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.complaints_id_seq', 23, true);


--
-- Name: image_hashes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.image_hashes_id_seq', 1, false);


--
-- Name: issues_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.issues_id_seq', 12, true);


--
-- Name: jurisdictions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.jurisdictions_id_seq', 6, true);


--
-- Name: user_rate_limits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_rate_limits_id_seq', 8, true);


--
-- Name: user_reporting_limits_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_reporting_limits_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 42, true);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: authorities authorities_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorities
    ADD CONSTRAINT authorities_email_key UNIQUE (email);


--
-- Name: authorities authorities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorities
    ADD CONSTRAINT authorities_pkey PRIMARY KEY (id);


--
-- Name: categories categories_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_unique UNIQUE (name);


--
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- Name: complaint_routing_logs complaint_routing_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs
    ADD CONSTRAINT complaint_routing_logs_pkey PRIMARY KEY (id);


--
-- Name: complaints complaints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_pkey PRIMARY KEY (id);


--
-- Name: image_hashes image_hashes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_hashes
    ADD CONSTRAINT image_hashes_pkey PRIMARY KEY (id);


--
-- Name: issues issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_pkey PRIMARY KEY (id);


--
-- Name: jurisdictions jurisdictions_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_name_key UNIQUE (name);


--
-- Name: jurisdictions jurisdictions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.jurisdictions
    ADD CONSTRAINT jurisdictions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: user_rate_limits user_rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rate_limits
    ADD CONSTRAINT user_rate_limits_pkey PRIMARY KEY (id);


--
-- Name: user_rate_limits user_rate_limits_user_id_submission_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rate_limits
    ADD CONSTRAINT user_rate_limits_user_id_submission_date_key UNIQUE (user_id, submission_date);


--
-- Name: user_reporting_limits user_reporting_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reporting_limits
    ADD CONSTRAINT user_reporting_limits_pkey PRIMARY KEY (id);


--
-- Name: user_reporting_limits user_reporting_limits_user_id_report_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reporting_limits
    ADD CONSTRAINT user_reporting_limits_user_id_report_date_key UNIQUE (user_id, report_date);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);


--
-- Name: idx_audit_logs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);


--
-- Name: idx_authorities_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authorities_category ON public.authorities USING btree (category_id);


--
-- Name: idx_authorities_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authorities_email ON public.authorities USING btree (email);


--
-- Name: idx_authorities_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authorities_jurisdiction ON public.authorities USING btree (jurisdiction_id);


--
-- Name: idx_authorities_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_authorities_level ON public.authorities USING btree (authority_level);


--
-- Name: idx_complaints_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_assigned_to ON public.complaints USING btree (assigned_to);


--
-- Name: idx_complaints_category_only; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_category_only ON public.complaints USING btree (category_id);


--
-- Name: idx_complaints_distance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_distance ON public.complaints USING btree (distance_meters);


--
-- Name: idx_complaints_duplicate_of; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_duplicate_of ON public.complaints USING btree (duplicate_of);


--
-- Name: idx_complaints_filter_partial; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_filter_partial ON public.complaints USING btree (category_id, created_at) WHERE ((validation_status)::text <> 'DUPLICATE'::text);


--
-- Name: idx_complaints_image_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_image_hash ON public.complaints USING btree (image_hash);


--
-- Name: idx_complaints_issue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_issue ON public.complaints USING btree (issue_id);


--
-- Name: idx_complaints_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_jurisdiction ON public.complaints USING btree (jurisdiction_id);


--
-- Name: idx_complaints_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_location ON public.complaints USING gist (location);


--
-- Name: idx_complaints_reporter_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_reporter_location ON public.complaints USING gist (reporter_location);


--
-- Name: idx_complaints_spatial_optimized; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_spatial_optimized ON public.complaints USING gist (location) WHERE (((validation_status)::text <> 'DUPLICATE'::text) AND (category_id IS NOT NULL));


--
-- Name: idx_complaints_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_status ON public.complaints USING btree (status);


--
-- Name: idx_complaints_trust_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_trust_level ON public.complaints USING btree (trust_level);


--
-- Name: idx_complaints_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_user ON public.complaints USING btree (user_id);


--
-- Name: idx_complaints_validation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_complaints_validation_status ON public.complaints USING btree (validation_status);


--
-- Name: idx_image_hashes_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_image_hashes_hash ON public.image_hashes USING btree (image_hash);


--
-- Name: idx_issues_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_category ON public.issues USING btree (category_id);


--
-- Name: idx_issues_jurisdiction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_jurisdiction ON public.issues USING btree (jurisdiction_id);


--
-- Name: idx_issues_location; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_location ON public.issues USING gist (location);


--
-- Name: idx_issues_sla_breached; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_sla_breached ON public.issues USING btree (is_sla_breached);


--
-- Name: idx_issues_sla_deadline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_sla_deadline ON public.issues USING btree (sla_deadline);


--
-- Name: idx_issues_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_status ON public.issues USING btree (status);


--
-- Name: idx_issues_ward; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_issues_ward ON public.issues USING btree (ward_id);


--
-- Name: idx_jurisdictions_boundary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_jurisdictions_boundary ON public.jurisdictions USING gist (boundary);


--
-- Name: idx_notifications_complaint_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_complaint_id ON public.notifications USING btree (complaint_id);


--
-- Name: idx_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_created_at ON public.notifications USING btree (created_at DESC);


--
-- Name: idx_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_type ON public.notifications USING btree (type);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, is_read);


--
-- Name: idx_routing_logs_authority_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_routing_logs_authority_id ON public.complaint_routing_logs USING btree (routed_to_authority_id);


--
-- Name: idx_user_rate_limits_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_rate_limits_user_date ON public.user_rate_limits USING btree (user_id, submission_date);


--
-- Name: idx_user_reporting_limits_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_reporting_limits_user_date ON public.user_reporting_limits USING btree (user_id, report_date);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: jurisdictions trigger_update_jurisdiction_area; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_jurisdiction_area BEFORE INSERT OR UPDATE ON public.jurisdictions FOR EACH ROW EXECUTE FUNCTION public.update_jurisdiction_area();


--
-- Name: notifications trigger_update_notification_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_notification_timestamp BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.update_notification_timestamp();


--
-- Name: audit_logs audit_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: authorities authorities_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorities
    ADD CONSTRAINT authorities_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: authorities authorities_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.authorities
    ADD CONSTRAINT authorities_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id);


--
-- Name: complaint_routing_logs complaint_routing_logs_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs
    ADD CONSTRAINT complaint_routing_logs_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: complaint_routing_logs complaint_routing_logs_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs
    ADD CONSTRAINT complaint_routing_logs_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: complaint_routing_logs complaint_routing_logs_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs
    ADD CONSTRAINT complaint_routing_logs_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id) ON DELETE CASCADE;


--
-- Name: complaint_routing_logs complaint_routing_logs_routed_to_authority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaint_routing_logs
    ADD CONSTRAINT complaint_routing_logs_routed_to_authority_id_fkey FOREIGN KEY (routed_to_authority_id) REFERENCES public.authorities(id);


--
-- Name: complaints complaints_assigned_authority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_authority_id_fkey FOREIGN KEY (assigned_authority_id) REFERENCES public.authorities(id);


--
-- Name: complaints complaints_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: complaints complaints_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: complaints complaints_duplicate_of_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.complaints(id);


--
-- Name: complaints complaints_escalated_authority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_escalated_authority_id_fkey FOREIGN KEY (escalated_authority_id) REFERENCES public.authorities(id);


--
-- Name: complaints complaints_escalated_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_escalated_to_fkey FOREIGN KEY (escalated_to) REFERENCES public.users(id);


--
-- Name: complaints complaints_issue_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_issue_id_fkey FOREIGN KEY (issue_id) REFERENCES public.issues(id);


--
-- Name: complaints complaints_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id);


--
-- Name: complaints complaints_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.complaints
    ADD CONSTRAINT complaints_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: image_hashes image_hashes_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.image_hashes
    ADD CONSTRAINT image_hashes_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id);


--
-- Name: issues issues_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id);


--
-- Name: issues issues_jurisdiction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_jurisdiction_id_fkey FOREIGN KEY (jurisdiction_id) REFERENCES public.jurisdictions(id);


--
-- Name: issues issues_resolved_by_authority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_resolved_by_authority_id_fkey FOREIGN KEY (resolved_by_authority_id) REFERENCES public.authorities(id);


--
-- Name: issues issues_verified_by_authority_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.issues
    ADD CONSTRAINT issues_verified_by_authority_id_fkey FOREIGN KEY (verified_by_authority_id) REFERENCES public.authorities(id);


--
-- Name: notifications notifications_complaint_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_complaint_id_fkey FOREIGN KEY (complaint_id) REFERENCES public.complaints(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_rate_limits user_rate_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_rate_limits
    ADD CONSTRAINT user_rate_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_reporting_limits user_reporting_limits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_reporting_limits
    ADD CONSTRAINT user_reporting_limits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 5pva1LNc1lB04egqjGgTY6cZQrivvVKP9Q8xG38Cfmfc4Vxp39J5WD5FXVWKjGh

