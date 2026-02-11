import { UserProfile, UserRole, GymClass, ClassSession, Reservation, Announcement } from './types';

// Mapped from old 'User' type to 'UserProfile'
export const MOCK_USERS: UserProfile[] = [
  {
    id: 'admin-1',
    email: 'admin@openperk.com',
    full_name: 'Admin User',
    role: UserRole.ADMIN,
    avatar_url: 'https://picsum.photos/200',
    date_start: new Date().toISOString(),
    is_active: true
  },
  {
    id: 'student-1',
    email: 'alumno@openperk.com',
    full_name: 'Juan Pérez',
    role: UserRole.STUDENT,
    avatar_url: 'https://picsum.photos/201',
    unit: 'Unit A',
    date_start: new Date().toISOString(),
    is_active: true
  },
  {
    id: 'student-2',
    email: 'maria@openperk.com',
    full_name: 'Maria Garcia',
    role: UserRole.STUDENT,
    avatar_url: 'https://picsum.photos/202',
    unit: 'Unit B',
    date_start: new Date().toISOString(),
    is_active: true
  }
];

export const MOCK_CLASSES: GymClass[] = [
  {
    id: 'c1',
    name: 'Morning Yoga',
    description: 'Sarah Jenkins', // Mapping instructor to description for now or could add instructor field to type
    capacity: 15,
    day_of_week: 1, // Mon
    start_time: '07:00:00',
    end_time: '08:00:00',
    image_url: 'https://picsum.photos/800/400?random=1',
    is_active: true
  },
  {
    id: 'c2',
    name: 'HIIT Blast',
    description: 'Mike Tyson',
    capacity: 20,
    day_of_week: 2, // Tue
    start_time: '18:30:00',
    end_time: '19:15:00',
    image_url: 'https://picsum.photos/800/400?random=2',
    is_active: true
  },
  {
    id: 'c3',
    name: 'Spinning',
    description: 'Anna Spin',
    capacity: 10,
    day_of_week: 6, // Sat
    start_time: '10:00:00',
    end_time: '10:50:00',
    image_url: 'https://picsum.photos/800/400?random=3',
    is_active: true
  }
];

// Generate sessions for the current month
const generateSessions = (): ClassSession[] => {
  const sessions: ClassSession[] = [];
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  MOCK_CLASSES.forEach(cls => {
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      if (date.getDay() === cls.day_of_week) {
        sessions.push({
          id: `sess-${cls.id}-${d}`,
          class_id: cls.id,
          session_date: date.toISOString().split('T')[0],
          start_time: cls.start_time,
          end_time: cls.end_time,
          capacity: cls.capacity,
          status: 'available',
          class: cls
        });
      }
    }
  });
  return sessions;
};

export const MOCK_SESSIONS: ClassSession[] = generateSessions();

export const MOCK_BOOKINGS: Reservation[] = [
  {
    id: 'b1',
    user_id: 'student-1',
    session_id: MOCK_SESSIONS[0].id,
    status: 'confirmed',
    created_at: new Date().toISOString(),
    session: MOCK_SESSIONS[0]
  }

];

export const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'a1',
    title: 'New Equipment Arrived!',
    content: 'We have upgraded our treadmills to the latest model. Come try them out!',
    created_at: new Date().toISOString(),
    priority: 1,
    is_published: true
  },
  {
    id: 'a2',
    title: 'Holiday Hours',
    content: 'We will be closed on December 25th only.',
    created_at: new Date().toISOString(),
    priority: 1,
    is_published: true
  }
];
