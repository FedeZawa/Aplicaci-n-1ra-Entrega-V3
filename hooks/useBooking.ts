import { useState } from 'react';
import { bookingService } from '../services/bookingService';

export function useBooking() {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const bookSession = async (sessionId: string) => {
        setIsProcessing(true);
        setError(null);
        try {
            const reservation = await bookingService.createReservation(sessionId);
            return reservation;
        } catch (err: any) {
            // Extract error message from edge function response if possible
            const message = err.message || 'Error creating reservation';
            setError(message);
            throw err;
        } finally {
            setIsProcessing(false);
        }
    };

    const cancelBooking = async (reservationId: string) => {
        setIsProcessing(true);
        setError(null);
        try {
            await bookingService.cancelReservation(reservationId);
        } catch (err: any) {
            setError(err.message || 'Error cancelling reservation');
            throw err;
        } finally {
            setIsProcessing(false);
        }
    };

    return {
        bookSession,
        cancelBooking,
        isProcessing,
        error
    };
}
