import { useState, useEffect, createContext, useContext } from "react";
import { supabase } from "../lib/supabase.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaFactorId, setMfaFactorId] = useState(null);

  const checkMfaStatus = async () => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) return;
      if (data.currentLevel === "aal1" && data.nextLevel === "aal2") {
        // User has MFA enrolled but hasn't verified yet this session
        const { data: factors } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (totp) {
          setMfaRequired(true);
          setMfaFactorId(totp.id);
        }
      } else {
        setMfaRequired(false);
        setMfaFactorId(null);
      }
    } catch (e) {
      // MFA check failed — don't block login
    }
  };

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await checkMfaStatus();
      }
      setLoading(false);
    });

    // Listen for auth changes — defer MFA check to avoid Supabase auth lock deadlock
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          setTimeout(checkMfaStatus, 0);
        } else {
          setMfaRequired(false);
          setMfaFactorId(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email, password, options = {}) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options });
    if (error) throw error;
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // After sign in, check if MFA is needed
    await checkMfaStatus();
    return data;
  };

  const verifyMfa = async (code) => {
    if (!mfaFactorId) throw new Error("No MFA factor found");
    const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId: mfaFactorId });
    if (challengeErr) throw challengeErr;
    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) throw verifyErr;
    setMfaRequired(false);
    setMfaFactorId(null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setMfaRequired(false);
    setMfaFactorId(null);
  };

  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, mfaRequired, signUp, signIn, signOut, resetPassword, verifyMfa }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
