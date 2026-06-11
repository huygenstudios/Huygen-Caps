"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { User } from "@supabase/supabase-js";
import { getBillingMe, getBillingPlans, getUserUsage, createCheckout } from "@/lib/api";

type UsageData = Awaited<ReturnType<typeof getUserUsage>>;
type BillingData = Awaited<ReturnType<typeof getBillingMe>>;
type PlansData = Awaited<ReturnType<typeof getBillingPlans>>;

export default function BillingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [plansInfo, setPlansInfo] = useState<PlansData | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // Load session
        if (supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          setSessionUser(session?.user || null);
        }

        // Fetch data in parallel
        const [usageRes, billingRes, plansRes] = await Promise.all([
          getUserUsage().catch(() => null),
          getBillingMe().catch(() => null),
          getBillingPlans().catch(() => null),
        ]);

        setUsage(usageRes);
        setBilling(billingRes);
        setPlansInfo(plansRes);

      } catch (err: unknown) {
        console.error("Billing page load error:", err);
        setError("Failed to load billing information.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const handleCheckout = async (planKey: string) => {
    if (!sessionUser) {
      router.push("/login");
      return;
    }

    setCheckoutLoading(planKey);
    setError(null);
    try {
      const res = await createCheckout(planKey);
      if (res.short_url) {
        window.location.href = res.short_url;
      } else {
        setError("Checkout URL not returned from server.");
        setCheckoutLoading(null);
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || "Failed to start checkout.");
      setCheckoutLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
        <p className="text-gray-400">Loading billing information...</p>
      </div>
    );
  }

  const isBillingEnabled = plansInfo?.billing_enabled ?? false;

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 md:p-12 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Billing & Usage</h1>
          <button 
            onClick={() => router.push("/editor")}
            className="text-sm px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded transition"
          >
            Back to Editor
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-800 rounded text-red-200">
            {error}
          </div>
        )}

        {!isBillingEnabled && (
          <div className="mb-8 p-4 bg-yellow-900/50 border border-yellow-800 rounded text-yellow-200">
            Billing is not enabled yet on this instance.
          </div>
        )}

        {/* Top Row: Current Plan & Usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* Current Plan Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-2">Current Plan</h2>
            <div className="text-3xl font-bold uppercase text-blue-400 mb-4">
              {billing?.current_plan || "free"}
            </div>
            
            {!sessionUser && (
              <div className="mt-4 p-3 bg-gray-700/50 rounded text-sm">
                <p>You are using Huygen Caps anonymously.</p>
                <button 
                  onClick={() => router.push("/login")}
                  className="mt-2 text-blue-400 hover:text-blue-300 font-medium"
                >
                  Sign in to save your progress and upgrade.
                </button>
              </div>
            )}
            
            {!!sessionUser && billing?.subscription_status === "active" && (
              <p className="text-sm text-green-400">
                Your subscription is active. Renews: {billing.current_period_end ? new Date(billing.current_period_end).toLocaleDateString() : 'N/A'}
              </p>
            )}
          </div>

          {/* Usage Quota Card */}
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Usage Today</h2>
            {usage ? (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Generation Minutes</span>
                    <span>{usage.generation_minutes_used} / {usage.generation_minutes_limit}m</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full" 
                      style={{ width: `${Math.min(100, (usage.generation_minutes_used / usage.generation_minutes_limit) * 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Exports Today</span>
                    <span>{usage.exports_today} / {usage.exports_per_day}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div 
                      className="bg-purple-500 h-2 rounded-full" 
                      style={{ width: `${Math.min(100, (usage.exports_today / usage.exports_per_day) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">Usage data unavailable.</p>
            )}
          </div>
        </div>

        {/* Plans Grid */}
        <h2 className="text-2xl font-bold mb-6">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plansInfo?.plans?.map((plan) => {
            const isCurrent = billing?.current_plan === plan.plan_key;
            return (
              <div 
                key={plan.plan_key}
                className={`bg-gray-800 rounded-lg p-6 border-2 flex flex-col ${
                  isCurrent ? "border-blue-500 shadow-lg shadow-blue-900/20" : "border-gray-700"
                }`}
              >
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold uppercase">{plan.plan_key}</h3>
                  {isCurrent && (
                    <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full font-semibold uppercase">
                      Current
                    </span>
                  )}
                </div>
                
                <ul className="space-y-3 mb-8 flex-1 text-sm text-gray-300">
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> {plan.generation_minutes_monthly} mins / month
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> {plan.exports_per_day} exports / day
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-blue-400">✓</span> Up to {plan.max_upload_duration_sec}s uploads
                  </li>
                  {plan.watermark_required ? (
                     <li className="flex items-center gap-2 text-gray-500">
                     <span className="text-gray-500">⚠</span> Watermark added
                   </li>
                  ) : (
                    <li className="flex items-center gap-2">
                      <span className="text-blue-400">✓</span> No watermark
                    </li>
                  )}
                  {plan.hd_export_allowed ? (
                    <li className="flex items-center gap-2">
                      <span className="text-blue-400">✓</span> HD 1080p Export
                    </li>
                  ) : (
                    <li className="flex items-center gap-2 text-gray-500">
                      <span className="text-gray-500">✗</span> 720p Export max
                    </li>
                  )}
                </ul>

                <button
                  onClick={() => handleCheckout(plan.plan_key)}
                  disabled={isCurrent || plan.plan_key === "free" || !isBillingEnabled || checkoutLoading === plan.plan_key}
                  className={`w-full py-3 rounded font-bold transition-colors ${
                    isCurrent 
                      ? "bg-gray-700 text-gray-400 cursor-not-allowed" 
                      : plan.plan_key === "free" 
                        ? "bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-500 text-white"
                  } disabled:opacity-50`}
                >
                  {checkoutLoading === plan.plan_key 
                    ? "Loading..." 
                    : isCurrent 
                      ? "Current Plan" 
                      : plan.plan_key === "free" 
                        ? "Default" 
                        : "Upgrade"}
                </button>
              </div>
            );
          })}
          
          {(!plansInfo || !plansInfo.plans || plansInfo.plans.length === 0) && (
            <div className="col-span-full text-center text-gray-400 py-12">
              No plans available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
