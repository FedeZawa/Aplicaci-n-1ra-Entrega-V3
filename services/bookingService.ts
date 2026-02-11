import { supabase } from './supabaseClient';
import { Reservation, ClassSession, GymClass, Announcement, UserProfile } from '../types';

export const bookingService = {
    /**
     * Calls the Edge Function to validate and create a reservation.
     */
    async createReservation(sessionId: string): Promise<Reservation> {
        const { data: { session } } = await supabase.auth.getSession();
        const { data, error } = await supabase.functions.invoke('validate-booking', {
            body: { session_id: sessionId },
            headers: {
                Authorization: `Bearer ${session?.access_token}`
            }
        });

        if (error) throw error;
        return data as Reservation;
    },

    /**
     * Fetches available sessions for a given date range.
     */
    async getSessions(startDate: string, endDate: string): Promise<ClassSession[]> {
        const { data, error } = await supabase
            .from('class_sessions')
            .select('*, class:classes(*)')
            .gte('session_date', startDate)
            .lte('session_date', endDate)
            .order('session_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (error) throw error;
        return data as ClassSession[];
    },

    /**
     * Subscribes to realtime updates on the reservations table.
     * Callback receives the payload.
     */
    /**
     * Subscribes to realtime updates on the reservations table.
     * Optionally filters by userId.
     */
    subscribeToReservations(callback: (payload: any) => void, userId?: string) {
        const filter = userId ? `user_id=eq.${userId}` : undefined;
        return supabase
            .channel('public:reservations')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'reservations', filter },
                (payload) => callback(payload)
            )
            .subscribe();
    },

    /**
     * Fetch user's reservations.
     */
    async getUserReservations(): Promise<Reservation[]> {
        const { data, error } = await supabase
            .from('reservations')
            .select('*, session:class_sessions(*, class:classes(*))')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Reservation[];
    },

    /**
     * Cancel a reservation.
     * Users can only cancel their own reservations (enforced by RLS).
     */
    /**
     * Cancel a reservation.
     * Users can only cancel their own reservations (enforced by RLS).
     */
    async cancelReservation(reservationId: string): Promise<void> {
        const { error } = await supabase
            .from('reservations')
            .update({ status: 'cancelled' })
            .eq('id', reservationId);

        if (error) throw error;
    },

    /**
     * Fetch all active classes (definitions).
     */
    async getClasses(): Promise<GymClass[]> {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('is_active', true)
            .order('name');

        if (error) throw error;
        return data as GymClass[];
    },

    /**
     * Create a new class definition.
     */
    async createClass(cls: Partial<GymClass>): Promise<GymClass> {
        const { data, error } = await supabase
            .from('classes')
            .insert(cls)
            .select()
            .single();

        if (error) throw error;
        return data as GymClass;
    },

    /**
     * Update an existing class definition.
     */
    async updateClass(id: string, cls: Partial<GymClass>): Promise<GymClass> {
        const { data, error } = await supabase
            .from('classes')
            .update(cls)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data as GymClass;
    },

    /**
     * Delete a class definition (mark as inactive or hard delete).
     * Blueprints suggest keeping isActive=false, but we'll implement delete as requested.
     */
    async deleteClass(id: string): Promise<void> {
        const { error } = await supabase
            .from('classes')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Update session status (e.g., cancel a session).
     */
    async updateSessionStatus(id: string, status: 'available' | 'cancelled' | 'completed'): Promise<void> {
        const { error } = await supabase
            .from('class_sessions')
            .update({ status })
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Fetch published announcements.
     */
    async getAnnouncements(): Promise<Announcement[]> {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('is_published', true)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data as Announcement[];
    },

    /**
     * Fetch all students (for admin).
     */
    async getStudents(): Promise<UserProfile[]> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('role', 'student')
            .order('full_name');

        if (error) throw error;
        return data as UserProfile[];
    },

    /**
     * Registers one or more students via Edge Function.
     */
    async registerStudent(studentData: { email: string, full_name: string, unit: string } | Array<{ email: string, full_name: string, unit: string }>): Promise<any> {
        console.log('bookingService: Attempting to register student(s)');

        const { data: { session } } = await supabase.auth.getSession();
        console.log('bookingService: Session found:', !!session);
        if (!session) {
            throw new Error('You must be logged in to register students.');
        }

        console.log('bookingService: Invoking admin-register-user');
        const { data, error } = await supabase.functions.invoke('admin-register-user', {
            body: studentData,
            headers: {
                Authorization: `Bearer ${session.access_token}`
            }
        });

        if (error) {
            console.error('bookingService: Edge Function call failed:', error);
            throw error;
        }

        return data;
    },

    /**
     * Deletes a student profile.
     * Note: This only deletes from public.profiles. Admin logic in Edge Function 
     * would be needed to delete from auth.users (not implemented for safety).
     */
    async deleteStudent(userId: string): Promise<void> {
        const { error } = await supabase
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (error) throw error;
    }
};
