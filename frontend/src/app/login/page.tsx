"use client";

import React, { useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "info" });

  useEffect(() => {
    // Check if already logged in
    supabase?.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        const next = searchParams?.get("next") || "/editor";
        router.push(next);
      }
    });
  }, [router, searchParams]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setMessage({ text: "Auth is not configured on this instance.", type: "error" });
      return;
    }

    setLoading(true);
    setMessage({ text: "", type: "info" });

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/editor",
          },
        });
        if (error) throw error;
        setMessage({ text: "Success! Please check your email to verify your account.", type: "success" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        const next = searchParams?.get("next") || "/editor";
        router.push(next);
      }
    } catch (err: Error | unknown) {
      const errorMessage = err instanceof Error ? err.message : "An error occurred during authentication.";
      setMessage({ text: errorMessage, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-950 p-4 font-sans text-gray-100">
      <div className="w-full max-w-md p-8 bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">
            Huygen Caps
          </h1>
          <p className="text-gray-400">
            {isSignUp ? "Create a new account" : "Sign in to your account"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full p-3 bg-gray-950 rounded-xl text-white border border-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full p-3 bg-gray-950 rounded-xl text-white border border-gray-800 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full mt-2 p-3 bg-blue-600 rounded-xl font-semibold text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : isSignUp ? (
              "Sign Up"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        {message.text && (
          <div
            className={`mt-6 p-4 rounded-xl text-sm ${
              message.type === "error"
                ? "bg-red-950/50 text-red-400 border border-red-900/50"
                : message.type === "success"
                ? "bg-green-950/50 text-green-400 border border-green-900/50"
                : "bg-blue-950/50 text-blue-400 border border-blue-900/50"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="mt-8 text-center text-sm text-gray-500">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setMessage({ text: "", type: "info" });
            }}
            className="text-blue-500 hover:text-blue-400 font-medium hover:underline focus:outline-none"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-gray-950 text-white">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
