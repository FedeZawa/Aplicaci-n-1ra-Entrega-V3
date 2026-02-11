export enum UserRole {
  ADMIN = 'admin',
  STUDENT = 'student'
}

export interface UserProfile {
  id: string; // uuid
  email: string;
  full_name: string;
  role: UserRole;
  date_start: string; // ISO date
  is_active: boolean;
  unit?: string;
  avatar_url?: string;
}

export interface GymClass {
  id: string; // uuid
  name: string;
  description?: string;
  capacity: number;
  day_of_week: number; // 0-6
  start_time: string; // "HT:mm:ss"
  end_time: string; // "HT:mm:ss"
  image_url?: string;
  is_active: boolean;
}

export type SessionStatus = 'available' | 'cancelled' | 'completed';

export interface ClassSession {
  id: string; // uuid
  class_id: string; // FK
  session_date: string; // YYYY-MM-DD
  start_time: string;
  end_time: string;
  capacity: number;
  status: SessionStatus;
  // Hydrated fields (optional)
  class?: GymClass;
  current_bookings_count?: number; // Calculated view
}

export type ReservationStatus = 'confirmed' | 'cancelled';

export interface Reservation {
  id: string; // uuid
  session_id: string;
  user_id: string;
  status: ReservationStatus;
  created_at: string;
  // Hydrated fields
  session?: ClassSession;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: number;
  is_published: boolean;
  created_at: string;
}

export interface AppSettings {
  min_hours_advance: number;
  max_active_reservations: number;
  allow_cancellations: boolean;
  theme_default: 'light' | 'dark';
}

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}
