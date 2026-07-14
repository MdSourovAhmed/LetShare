import React from 'react'
import ComparisonDashboard from "@letshare/core/components/stats/ComparisonDashboard"

/**
 * AnalyticsPage — LAN app
 *
 * Same shared ComparisonDashboard as the Internet app.
 * Records include both Internet and LAN transfers from this browser,
 * so when you run both apps for comparison testing you see both sets
 * of results on the same dashboard.
 */
export default function AnalyticsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <ComparisonDashboard />
      {/* ComparisonDashboard */}
    </div>
  )
}