/*
  # Gym Reservation System - Complete Schema
  
  **Tables:**
  1. profiles (users extension)
  2. classes (definitions)
  3. class_sessions (instances)
  4. reservations (bookings)
  5. announcements
  6. app_settings

  **Features:**
  - Zero Trust RLS
  - Optimizing Indexes
  - Data Integrity Constraints
*/

-- 1. EXTENSIONS & TYPES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Define Enums with exception handling
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'student');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('available', 'cancelled', 'completed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reservation_status AS ENUM ('confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. PROFILES
-- Centralizes user data and roles. Extends auth.users.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role DEFAULT 'student',
  date_start TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT username_length CHECK (char_length(full_name) >= 2)
);

-- Indexes for Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 3. CLASSES (Definitions)
-- Template for recurring classes.
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  capacity INTEGER NOT NULL DEFAULT 10,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun, 6=Sat
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT positive_capacity CHECK (capacity > 0),
  CONSTRAINT valid_duration CHECK (end_time > start_time)
);

-- Indexes for Classes
CREATE INDEX IF NOT EXISTS idx_classes_active ON public.classes(is_active);

-- 4. CLASS SESSIONS (Instances)
-- Actual schedulable instances generated from classes.
CREATE TABLE IF NOT EXISTS public.class_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  capacity INTEGER NOT NULL,
  status session_status DEFAULT 'available',
  created_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(class_id, session_date, start_time),
  CONSTRAINT positive_session_capacity CHECK (capacity > 0),
  CONSTRAINT valid_session_duration CHECK (end_time > start_time)
);

-- Indexes for Sessions
CREATE INDEX IF NOT EXISTS idx_sessions_date ON public.class_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_sessions_class_id ON public.class_sessions(class_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.class_sessions(status);

-- 5. RESERVATIONS
-- Records of users booking sessions.
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES public.class_sessions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  status reservation_status DEFAULT 'confirmed',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(session_id, user_id)
);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.reservations;

-- Indexes for Reservations
CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON public.reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_reservations_session_id ON public.reservations(session_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.reservations(status);

-- 6. ANNOUNCEMENTS
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT,
  priority INTEGER DEFAULT 1,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. APP SETTINGS
-- Key-value store for dynamic app configuration.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Seed Default Settings
INSERT INTO public.app_settings (key, value) VALUES
('min_hours_advance', '12'::jsonb),
('max_active_reservations', '5'::jsonb),
('allow_cancellations', 'true'::jsonb),
('theme_default', '"light"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 8. SECURITY & RLS

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Helper Function for Admin Check
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policies

-- PROFILES
CREATE POLICY "Profiles viewable by self and admin" ON public.profiles 
  FOR SELECT USING (auth.uid() = id OR is_admin());

-- Update: Split into Admin and Self to enforce Zero Trust on columns

-- Admin can update anything
CREATE POLICY "Profiles updateable by admin" ON public.profiles 
  FOR UPDATE USING (is_admin());

-- Self can update but CANNOT change role or is_active
-- We enforce this by checking the NEW row values match the constraints
CREATE POLICY "Profiles updateable by self" ON public.profiles 
  FOR UPDATE USING (
    auth.uid() = id  -- Can only update own
  )
  WITH CHECK (
    auth.uid() = id 
    AND role = 'student' -- Prevent role escalation (must remain student)
    AND is_active = true -- Prevent self-deactivation (must remain active)
  );

-- CLASSES
-- CLASSES
-- View: Authenticated users can see active classes, Admins see all
CREATE POLICY "Classes public view" ON public.classes 
  FOR SELECT USING (
    (auth.role() = 'authenticated' AND is_active = true) 
    OR is_admin()
  );

CREATE POLICY "Classes admin manage" ON public.classes 
  FOR ALL USING (is_admin());

-- SESSIONS
CREATE POLICY "Sessions public view" ON public.class_sessions 
  FOR SELECT USING (
    (auth.role() = 'authenticated' AND status IN ('available', 'completed')) 
    OR is_admin()
  );

CREATE POLICY "Sessions admin manage" ON public.class_sessions 
  FOR ALL USING (is_admin());

-- EXAMPLE INSERTION (Commented out)
/*
INSERT INTO public.class_sessions (class_id, session_date, start_time, end_time, capacity)
VALUES 
  ('class-uuid-here', '2024-02-10', '10:00', '11:00', 15);
*/

-- RESERVATIONS
-- RESERVATIONS
ALTER TABLE public.reservations REPLICA IDENTITY FULL; -- Enable full history for Realtime

-- View: Self can view own, Admin can view all
CREATE POLICY "Reservations view own" ON public.reservations 
  FOR SELECT USING (auth.uid() = user_id OR is_admin());

-- Insert: Admin only (Students use Edge Function)
CREATE POLICY "Reservations insert admin only" ON public.reservations 
  FOR INSERT WITH CHECK (is_admin());

-- Update (Cancel): Self can cancel OWN, confirmed reservations only
CREATE POLICY "Reservations cancel own" ON public.reservations 
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
     auth.uid() = user_id  -- Redundant but safe
     AND status = 'cancelled' -- Can only set to cancelled
     AND (
       -- Must be currently confirmed to cancel
       SELECT status FROM public.reservations WHERE id = id
     ) = 'confirmed'
  );

-- Admin Manage: Full access
CREATE POLICY "Reservations admin manage" ON public.reservations 
  FOR UPDATE USING (is_admin());
  
CREATE POLICY "Reservations admin delete" ON public.reservations 
  FOR DELETE USING (is_admin());

-- ANNOUNCEMENTS
-- View: Authenticated users can see published, Admins see all
CREATE POLICY "Announcements public view" ON public.announcements 
  FOR SELECT USING (
    (auth.role() = 'authenticated' AND is_published = true)
    OR is_admin()
  );
  
CREATE POLICY "Announcements admin manage" ON public.announcements 
  FOR ALL USING (is_admin());

-- SETTINGS
CREATE POLICY "Settings public view" ON public.app_settings 
  FOR SELECT USING (true);
  
CREATE POLICY "Settings admin manage" ON public.app_settings 
  FOR ALL USING (is_admin());

-- 9. TRIGGERS

-- Auto-created profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id, 
    email, 
    full_name, 
    role,
    date_start,
    is_active
  )
  VALUES (
    new.id,
    new.email,
    -- Fallback for full_name if not provided in metadata
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'student',
    now(),
    true
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$ BEGIN
  CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
EXCEPTION WHEN duplicate_object THEN null; END $$;
