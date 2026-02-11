/// <reference path="../deno-shim.d.ts" />
import { createClient } from "@supabase/supabase-js"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
    // 1. Manejo de CORS Preflight (OPTIONS)
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    console.log(`[validate-booking] Request starting: ${req.method}`);

    try {
        // 2. Autenticación del Usuario
        const authHeader = req.headers.get('Authorization');
        console.log("[validate-booking] Auth Header Present:", !!authHeader);

        if (!authHeader) {
            console.error("[validate-booking] Error: Missing Authorization header");
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        // Token extraction and validation
        const token = authHeader.replace('Bearer ', '');
        const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

        if (authError || !user) {
            console.error("[validate-booking] Auth failed. Error:", authError?.message);
            console.error("[validate-booking] Token prefix:", token.substring(0, 10) + "...");
            return new Response(JSON.stringify({
                error: 'Unauthorized',
                details: authError?.message || 'User not found',
                hint: 'Check if the token is valid and not expired'
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const supabaseServiceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        // Cliente con Service Role para lógica interna (saltar RLS)
        const supabase = createClient(supabaseUrl, supabaseServiceRole);

        // 3. Parsear el Body
        const { session_id } = await req.json();
        if (!session_id) throw new Error('session_id is required');

        // 4. Obtener Configuración y Sesion en paralelo
        const [settingsResult, sessionResult] = await Promise.all([
            supabase.from('app_settings').select('key, value'),
            supabase.from('class_sessions').select('*, class:classes(*)').eq('id', session_id).single()
        ]);

        if (sessionResult.error || !sessionResult.data) {
            throw new Error('Session not found');
        }

        const session = sessionResult.data;
        const settings = Object.fromEntries(settingsResult.data?.map(s => [s.key, s.value]) || []);

        // 5. Validaciones de Negocio

        // A. Estado de la sesión
        if (session.status !== 'available') {
            throw new Error(`Session is ${session.status}`);
        }

        // B. Capacidad
        const { count: currentBookings, error: countError } = await supabase
            .from('reservations')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', session_id)
            .eq('status', 'confirmed');

        if (countError) throw countError;
        if (currentBookings! >= session.capacity) {
            throw new Error('Session is full');
        }

        // C. Duplicate Booking
        const { data: existingBooking } = await supabase
            .from('reservations')
            .select('id')
            .eq('session_id', session_id)
            .eq('user_id', user.id)
            .eq('status', 'confirmed')
            .maybeSingle();

        if (existingBooking) {
            throw new Error('You already have a confirmed reservation for this session');
        }

        // D. Tiempo de antelación (min_hours_advance)
        const minHours = settings.min_hours_advance || 0;
        const sessionTime = new Date(`${session.session_date}T${session.start_time}`).getTime();
        const now = new Date().getTime();
        const hoursDiff = (sessionTime - now) / (1000 * 60 * 60);

        if (hoursDiff < minHours) {
            throw new Error(`Reservations must be made at least ${minHours} hours in advance`);
        }

        // E. Límite de reservas activas
        const maxActive = settings.max_active_reservations || 999;
        const { count: activeCount } = await supabase
            .from('reservations')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'confirmed');

        if (activeCount! >= maxActive) {
            throw new Error(`You have reached the maximum of ${maxActive} active reservations`);
        }

        // 6. Crear la Reserva
        const { data: reservation, error: reserveError } = await supabase
            .from('reservations')
            .insert({
                session_id: session_id,
                user_id: user.id,
                status: 'confirmed'
            })
            .select()
            .single();

        if (reserveError) throw reserveError;

        console.log(`[validate-booking] Success: Reservation ${reservation.id} created for user ${user.id}`);

        return new Response(JSON.stringify(reservation), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (error: any) {
        console.error('[validate-booking] Error:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
})
