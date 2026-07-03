import { Routes, Route, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { BottomNav } from './components/BottomNav'
import { ConnectionBanner } from './components/ConnectionBanner'
import { Login } from './pages/Login'
import { Home } from './pages/Home'
import { Customers } from './pages/Customers'
import { CustomerDetail } from './pages/CustomerDetail'
import { NewSale } from './pages/NewSale'
import { LogReturn } from './pages/LogReturn'
import { RecordPayment } from './pages/RecordPayment'
import { ActivityFeed } from './pages/ActivityFeed'

export default function App() {
  const location = useLocation()
  const hideNav = location.pathname === '/login'

  return (
    <div className="min-h-screen bg-cream pb-16">
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Home />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/sale" element={<NewSale />} />
          <Route path="/customers/:id/sale" element={<NewSale />} />
          <Route path="/return" element={<LogReturn />} />
          <Route path="/customers/:id/return" element={<LogReturn />} />
          <Route path="/payment" element={<RecordPayment />} />
          <Route path="/customers/:id/payment" element={<RecordPayment />} />
          <Route path="/activity" element={<ActivityFeed />} />
        </Route>
      </Routes>
      {!hideNav && <BottomNav />}
    </div>
  )
}
