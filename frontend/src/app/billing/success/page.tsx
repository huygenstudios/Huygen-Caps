"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBillingMe } from "@/lib/api";

type BillingData = Awaited<ReturnType<typeof getBillingMe>>;

export default function BillingSuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [timeoutReached, setTimeoutReached] = useState(false);

  useEffect(() => {
    let pollingActive = true;
    let attempts = 0;
    const maxAttempts = 15; // 30 seconds (2s per attempt)

    const pollBilling = async () => {
      try {
        const res = await getBillingMe();
        if (!pollingActive) return;

        if (res.current_plan === "creator" || res.current_plan === "pro") {
          setBilling(res);
          setLoading(false);
          pollingActive = false;
        } else {
          attempts++;
          if (attempts >= maxAttempts) {
            setBilling(res);
            setLoading(false);
            setTimeoutReached(true);
            pollingActive = false;
          } else {
            setTimeout(pollBilling, 2000);
          }
        }
      } catch (err) {
        console.error("Polling error", err);
        attempts++;
        if (attempts >= maxAttempts) {
          setLoading(false);
          setTimeoutReached(true);
          pollingActive = false;
        } else {
          setTimeout(pollBilling, 2000);
        }
      }
    };

    pollBilling();

    return () => {
      pollingActive = false;
    };
  }, []);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white font-sans p-6">
      <div className="w-full max-w-md p-8 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-center">
        {loading ? (
          <>
            <div className="mb-6 mx-auto w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <h1 className="text-2xl font-bold mb-2">Payment Processing</h1>
            <p className="text-gray-400">Waiting for webhook confirmation from Razorpay. This usually takes a few seconds...</p>
          </>
        ) : timeoutReached ? (
          <>
            <div className="mb-6 mx-auto w-16 h-16 bg-yellow-900/50 text-yellow-500 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold">!</span>
            </div>
            <h1 className="text-2xl font-bold mb-4">Payment Received</h1>
            <p className="text-gray-400 mb-8">
              We received your payment, but the backend is still waiting for the webhook confirmation. 
              Your plan will update automatically once confirmed.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => window.location.reload()}
                className="p-3 bg-blue-600 hover:bg-blue-500 rounded font-semibold transition"
              >
                Refresh Status
              </button>
              <button 
                onClick={() => router.push("/billing")}
                className="p-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition"
              >
                Go to Billing
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 mx-auto w-16 h-16 bg-green-900/50 text-green-500 rounded-full flex items-center justify-center">
              <span className="text-3xl">✓</span>
            </div>
            <h1 className="text-2xl font-bold mb-2">Upgrade Successful!</h1>
            <p className="text-gray-400 mb-6">
              You are now on the <span className="text-blue-400 font-bold uppercase">{billing?.current_plan}</span> plan.
            </p>
            <button 
              onClick={() => router.push("/editor")}
              className="w-full p-3 bg-blue-600 hover:bg-blue-500 rounded font-semibold transition"
            >
              Go to Editor
            </button>
          </>
        )}
      </div>
    </div>
  );
}
