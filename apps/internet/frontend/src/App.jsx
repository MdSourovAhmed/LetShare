// import React       from 'react'
// import { Routes, Route } from 'react-router-dom'
// import Layout      from './components/ui/Layout.jsx'
// import HomePage    from './pages/HomePage.jsx'
// import SendPage    from './pages/SendPage.jsx'
// import ReceivePage from './pages/ReceivePage.jsx'

// export default function App() {
//   return (
//     <Layout>
//       <Routes>
//         <Route path="/"        element={<HomePage />}    />
//         <Route path="/send"    element={<SendPage />}    />
//         <Route path="/receive" element={<ReceivePage />} />
//         {/* Catch-all — redirect unknown paths to home */}
//         <Route path="*"        element={<HomePage />}    />
//       </Routes>
//     </Layout>
//   )
// }



import React         from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout        from './components/ui/Layout'
import HomePage      from './pages/HomePage'
import SendPage      from './pages/SendPage'
import ReceivePage   from './pages/ReceivePage'
import AnalyticsPage from './pages/AnalyticsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<HomePage />}      />
        <Route path="/send"      element={<SendPage />}      />
        <Route path="/receive"   element={<ReceivePage />}   />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="*"          element={<HomePage />}      />
      </Routes>
    </Layout>
  )
}