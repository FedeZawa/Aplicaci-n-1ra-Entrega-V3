import { useState, useEffect } from 'react';
import { bookingService } from '../services/bookingService';
import { Reservation } from '../types';
import { supabase } from '../services/supabaseClient'; // Or use a proper Auth context

export function useUserReservations() {
    const [reservations, setReservations] = useState<Reservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        // Fetch initially
        fetchReservations();

        // Subscribe to Realtime changes
        const setupSubscription = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const subscription = bookingService.subscribeToReservations((payload) => {
                // Simple strategy: Refetch all on any change. 
                // Optimistic updates could be done here instead.
                fetchReservations();
            }, user.id);

            return () => {
                supabase.removeChannel(subscription);
            };
        };

        const cleanupPromise = setupSubscription();

        return () => {
            cleanupPromise.then(cleanup => cleanup && cleanup());
        };
    }, []);

    const fetchReservations = async () => {
        setLoading(true);
        try {
            const data = await bookingService.getUserReservations();
            setReservations(data);
        } catch (err: any) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    return { reservations, loading, error, refetch: fetchReservations };
}
