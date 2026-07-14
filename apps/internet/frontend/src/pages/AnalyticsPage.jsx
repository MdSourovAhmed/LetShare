import React from 'react'
import ComparisonDashboard from '@letshare/core/components/stats/ComparisonDashboard'

/**
 * AnalyticsPage — Internet app
 *
 * Thin route wrapper. All logic lives in the shared ComparisonDashboard
 * component (packages/core) so both apps share identical dashboards and
 * any future improvements automatically apply to both.
 *
 * Records are stored in IndexedDB per-browser, automatically populated
 * after each completed transfer when useTelemetry.finalise() is called.
 * No server involvement — everything is local.
 */
export default function AnalyticsPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      <ComparisonDashboard />
    </div>
  )
}