import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function usePremium(): { isPremium: boolean; loading: boolean } {
  const [isPremium, setIsPremium] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) { if (!cancelled) setLoading(false); return; }

      supabase
        .from("users")
        .select("is_premium")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (!cancelled) {
            setIsPremium(data?.is_premium ?? false);
            setLoading(false);
          }
        });
    });

    return () => { cancelled = true; };
  }, []);

  return { isPremium, loading };
}
