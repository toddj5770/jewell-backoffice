import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tqpysubmkurdzrqlebwo.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxcHlzdWJta3VyZHpycWxlYndvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NTQ1NTIsImV4cCI6MjA5MTUzMDU1Mn0.I3gPaZo4gP8_h5JNTPkpcI5zFhjpUtRWzif2WcYZUxY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
