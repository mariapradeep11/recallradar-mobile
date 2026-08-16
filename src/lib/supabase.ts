import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://gysnvpcxybmnfmjxebra.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd5c252cGN4eWJtbmZtanhlYnJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MjQ5NTMsImV4cCI6MjEwMDAwMDk1M30.QeDcOgkIS0GPKE3fQn4l_yBXZhpH7z7NZZ4dxuxgXH8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
