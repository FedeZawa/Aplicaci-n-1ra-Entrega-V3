import { supabase } from './supabaseClient';
import { Reservation, ClassSession } from '../types';

export const bookingService = {
    /**
     * Calls the Edge Function to validate and create a reservation.
     */
    async createReservation(sessionId: string): Promise<Reservation> {
        const { data, error } = await supabase.functions.invoke('validate-booking', {
            body: { session_id: sessionId },
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
    async cancelReservation(reservationId: string): Promise<void> {
        const { error } = await supabase
            .from('reservations')
            .update({ status: 'cancelled' })
            .eq('id', reservationId);

        if (error) throw error;
    }
};
