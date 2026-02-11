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

    try {
        const authHeader = req.headers.get('Authorization')
        console.log("[admin-register-user] Auth Header Present:", !!authHeader);

        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
        const supabaseAdmin = createClient(
            supabaseUrl,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Verify that the caller is an Admin
        const token = authHeader.replace('Bearer ', '')
        const { data: { user: caller }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !caller) {
            console.error("[admin-register-user] Auth Error (getUser):", authError?.message)
            return new Response(JSON.stringify({
                error: 'Unauthorized',
                details: authError?.message || 'User not found'
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 401,
            })
        }

        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role')
            .eq('id', caller.id)
            .single()

        if (profileError || profile?.role !== 'admin') {
            console.error("Admin Check Failed:", profileError, profile?.role)
            return new Response(JSON.stringify({ error: 'Only admins can register users' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 403,
            })
        }

        // 2. Parse Request and Normalize to Array
        const rawBody = await req.json()
        const usersToCreate = Array.isArray(rawBody) ? rawBody : [rawBody]
        const results = []

        console.log(`Processing ${usersToCreate.length} registration(s)`)

        // 3. Process Registrations
        for (const userData of usersToCreate) {
            const { email, password, full_name, unit } = userData

            if (!email || !full_name) {
                results.push({ email: email || 'unknown', error: 'Email and full_name are required' })
                continue
            }

            // Use provided password or a temporary default
            const userPassword = password || `Temp${Math.random().toString(36).slice(-8)}!`

            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: userPassword,
                email_confirm: true,
                user_metadata: {
                    full_name,
                    unit,
                    role: 'student'
                }
            })

            if (createError) {
                console.error(`Error creating user ${email}:`, createError.message)
                results.push({ email, error: createError.message })
            } else {
                console.log(`Successfully created user: ${email}`)
                results.push({ email, user_id: newUser.user.id })
            }
        }

        return new Response(JSON.stringify({ results }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })

    } catch (error: any) {
        console.error("Edge Function Error:", error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        })
    }
})
