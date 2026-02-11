import { createClient } from '@supabase/supabase-js';
import { MOCK_USERS, MOCK_CLASSES, MOCK_ANNOUNCEMENTS } from '../mockData.ts';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('Missing environment variables VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
}

// Service role client to bypass RLS and create users
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function migrate() {
    console.log('--- Starting Migration ---');

    // 0. Clear existing data
    console.log('Clearing existing data...');
    // We use service role, so we can delete even if RLS is enabled
    // Using a filter that matches all rows
    await supabase.from('reservations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('class_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('classes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('announcements').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // 1. Create Auth Users & Profiles
    console.log('Migrating Users...');
    for (const user of MOCK_USERS) {
        const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) throw listError;

        let authUser = authUsers.users.find(u => u.email === user.email);

        if (!authUser) {
            console.log(`Creating Auth user: ${user.email}`);
            const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
                email: user.email,
                password: 'password123',
                email_confirm: true,
                user_metadata: { full_name: user.full_name }
            });
            if (createError) {
                console.error(`Error creating ${user.email}:`, createError.message);
                continue;
            }
            authUser = newUser.user;
        }

        if (authUser) {
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: authUser.id,
                    email: user.email,
                    full_name: user.full_name,
                    role: user.role,
                    is_active: user.is_active,
                    unit: user.unit
                });
            if (profileError) console.error(`Error updating profile for ${user.email}:`, profileError.message);
        }
    }

    // 2. Migrate Classes
    console.log('Migrating Classes...');
    for (const cls of MOCK_CLASSES) {
        const { error: clsError } = await supabase
            .from('classes')
            .insert({
                name: cls.name,
                description: cls.description,
                capacity: cls.capacity,
                day_of_week: cls.day_of_week,
                start_time: cls.start_time,
                end_time: cls.end_time,
                image_url: cls.image_url,
                is_active: cls.is_active
            });
        if (clsError) console.error(`Error migrating class ${cls.name}:`, clsError.message);
    }

    // 3. Generate initial sessions
    console.log('Generating Classes Sessions for the next 30 days...');
    const { data: dbClasses } = await supabase.from('classes').select('*');
    if (dbClasses) {
        const sessions = [];
        const today = new Date();
        for (let i = 0; i < 30; i++) {
            const date = new Date(today);
            date.setDate(today.getDate() + i);
            const dayOfWeek = date.getDay();
            const dateStr = date.toISOString().split('T')[0];

            for (const cls of dbClasses) {
                if (cls.day_of_week === dayOfWeek) {
                    sessions.push({
                        class_id: cls.id,
                        session_date: dateStr,
                        start_time: cls.start_time,
                        end_time: cls.end_time,
                        capacity: cls.capacity,
                        status: 'available'
                    });
                }
            }
        }
        const { error: sessError } = await supabase.from('class_sessions').insert(sessions);
        if (sessError) console.error('Error generating sessions:', sessError.message);
    }

    // 4. Migrate Announcements
    console.log('Migrating Announcements...');
    for (const ann of MOCK_ANNOUNCEMENTS) {
        const { error: annError } = await supabase
            .from('announcements')
            .insert({
                title: ann.title,
                content: ann.content,
                priority: ann.priority,
                is_published: ann.is_published
            });
        if (annError) console.error(`Error migrating announcement ${ann.title}:`, annError.message);
    }

    // 5. Initial App Settings
    console.log('Setting App Settings...');
    const initialSettings = [
        { key: 'min_hours_advance', value: 12 },
        { key: 'max_active_reservations', value: 5 },
        { key: 'allow_cancellations', value: true },
        { key: 'theme_default', value: 'dark' }
    ];
    await supabase.from('app_settings').upsert(initialSettings);

    console.log('--- Migration Completed ---');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
