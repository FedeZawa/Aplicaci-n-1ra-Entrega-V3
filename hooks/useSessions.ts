import { useState, useEffect } from 'react';
import { bookingService } from '../services/bookingService';
import { ClassSession } from '../types';

export function useSessions(startDate: string, endDate: string) {
    const [sessions, setSessions] = useState<ClassSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        fetchSessions();
    }, [startDate, endDate]);

    const fetchSessions = async () => {
        setLoading(true);
        try {
            const data = await bookingService.getSessions(startDate, endDate);
            setSessions(data);
        } catch (err: any) {
            setError(err);
        } finally {
            setLoading(false);
        }
    };

    return { sessions, loading, error, refetch: fetchSessions };
}
