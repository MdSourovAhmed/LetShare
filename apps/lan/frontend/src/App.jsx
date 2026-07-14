

// /**
//  * App.jsx — LAN app router
//  *
//  * The LAN app is effectively a single page — everything lives in LobbyPage.
//  * The /* catch-all makes sure any sub-path (e.g. letshare.local/anything)
//  * still renders the lobby rather than a 404.
//  *
//  * Layout wraps the page with the header and footer.
//  */
// import React    from 'react'
// import { Routes, Route } from 'react-router-dom'
// import Layout   from './components/ui/Layout'
// import LobbyPage from './pages/LobbyPage'

// export default function App() {
//   return (
//     <Layout>
//       <Routes>
//         <Route path="/*" element={<LobbyPage />} />
//       </Routes>
//     </Layout>
//   )
// }





import React         from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout        from './components/ui/Layout'
import LobbyPage     from './pages/LobbyPage'
import AnalyticsPage from './pages/AnalyticsPage'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/"          element={<LobbyPage />}     />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/*"         element={<LobbyPage />}     />
      </Routes>
    </Layout>
  )
}