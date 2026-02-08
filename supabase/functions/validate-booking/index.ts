import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 0. Initialize Clients
        // Client for Auth User (limited scope)
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Admin Client for DB checks & writes (Service Role)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Authenticate & Verify User Status
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
        if (authError || !user) throw new Error('Unauthorized');

        // Check if user is active in 'profiles'
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('is_active')
            .eq('id', user.id)
            .single();

        if (profileError || !profile?.is_active) {
            return new Response(
                JSON.stringify({ error: 'User is not active' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
            );
        }

        // 2. Parse Request
        const { session_id } = await req.json()
        if (!session_id) throw new Error('Missing session_id')

        // 3. Fetch System Settings
        const { data: settingsData } = await supabaseAdmin.from('app_settings').select('key, value');
        const settings: any = {};
        settingsData?.forEach((row: any) => { settings[row.key] = row.value });

        const maxActive = settings.max_active_reservations ?? 5;
        const minHours = settings.min_hours_advance ?? 2;

        // 4. Validate Session Existence & Time
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('class_sessions')
            .select('id, capacity, class_id, session_date, start_time')
            .eq('id', session_id)
            .single();

        if (sessionError || !session) {
            return new Response(
                JSON.stringify({ error: 'Session not found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            );
        }

        // Combine date and time to check 'min_hours_advance'
        const sessionDateTime = new Date(`${session.session_date}T${session.start_time}`);
        const now = new Date();
        const hoursDiff = (sessionDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursDiff < minHours) {
            return new Response(
                JSON.stringify({ error: `Booking closed. Must book at least ${minHours} hours in advance.` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // 5. Check User's Active Reservations Limit
        const { count: activeCount } = await supabaseAdmin
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'confirmed');

        if ((activeCount ?? 0) >= maxActive) {
            return new Response(
                JSON.stringify({ error: `Limit reached: You have ${activeCount} active reservations (Max: ${maxActive})` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // 6. Check Session Capacity
        const { count: currentBookings } = await supabaseAdmin
            .from('reservations')
            .select('id', { count: 'exact', head: true })
            .eq('session_id', session_id)
            .eq('status', 'confirmed');

        if ((currentBookings ?? 0) >= session.capacity) {
            return new Response(
                JSON.stringify({ error: 'Class is full' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // 7. Check Double Booking
        const { data: existing } = await supabaseAdmin
            .from('reservations')
            .select('id')
            .eq('session_id', session_id)
            .eq('user_id', user.id)
            .eq('status', 'confirmed') // Only check confirmed, if cancelled they can re-book? usually yes.
            .maybeSingle();

        if (existing) {
            return new Response(
                JSON.stringify({ error: 'You already have a reservation for this session' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
        }

        // 8. Create Reservation
        const { data: reservation, error: insertError } = await supabaseAdmin
            .from('reservations')
            .insert({
                session_id: session_id,
                user_id: user.id,
                status: 'confirmed'
            })
            .select()
            .single();

        if (insertError) throw insertError;

        return new Response(
            JSON.stringify(reservation),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error: any) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
})
