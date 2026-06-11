"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function BillingCancelPage() {
  const router = useRouter();

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-900 text-white font-sans p-6">
      <div className="w-full max-w-md p-8 bg-gray-800 border border-gray-700 rounded-lg shadow-xl text-center">
        <div className="mb-6 mx-auto w-16 h-16 bg-gray-700 text-gray-400 rounded-full flex items-center justify-center">
          <span className="text-3xl">✕</span>
        </div>
        <h1 className="text-2xl font-bold mb-4">Payment Cancelled</h1>
        <p className="text-gray-400 mb-8">
          The checkout process was interrupted and no changes were made to your plan.
        </p>
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => router.push("/billing")}
            className="p-3 bg-blue-600 hover:bg-blue-500 rounded font-semibold transition"
          >
            Back to Billing
          </button>
          <button 
            onClick={() => router.push("/editor")}
            className="p-3 bg-gray-700 hover:bg-gray-600 rounded font-semibold transition"
          >
            Go to Editor
          </button>
        </div>
      </div>
    </div>
  );
}
