import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ModeGate } from './mode/ModeGate'
import { BottomNav } from './components/BottomNav'
import { DomesticNav } from './components/DomesticNav'
import { ConnectionBanner } from './components/ConnectionBanner'
import { Login } from './pages/Login'
import { ModeSelect } from './pages/ModeSelect'
import { Home } from './pages/Home'
import { Customers } from './pages/Customers'
import { AddCustomer } from './pages/AddCustomer'
import { CustomerDetail } from './pages/CustomerDetail'
import { NewSale } from './pages/NewSale'
import { LogReturn } from './pages/LogReturn'
import { RecordPayment } from './pages/RecordPayment'
import { ActivityFeed } from './pages/ActivityFeed'
import { BusinessDetails } from './pages/BusinessDetails'
import { CylinderPricing } from './pages/CylinderPricing'
import { Purchases } from './pages/Purchases'
import { RecordPurchase } from './pages/RecordPurchase'
import { Godown } from './pages/Godown'
import { SetCurrentStock } from './pages/SetCurrentStock'
import { AllStock } from './pages/AllStock'
import { DomesticHome } from './pages/domestic/DomesticHome'
import { DomesticNewBill } from './pages/domestic/DomesticNewBill'
import { DomesticStock } from './pages/domestic/DomesticStock'
import { DomesticPurchases } from './pages/domestic/DomesticPurchases'
import { DomesticRecordPurchase } from './pages/domestic/DomesticRecordPurchase'
import { DomesticHistory } from './pages/domestic/DomesticHistory'
import { DomesticCombos } from './pages/domestic/DomesticCombos'

export default function App() {
  const location = useLocation()
  const isDomestic = location.pathname.startsWith('/domestic')
  const hideNav = location.pathname === '/login' || location.pathname === '/choose' || location.pathname === '/stock'

  return (
    <div className="min-h-screen bg-cream pb-16">
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<ModeGate />}>
            <Route path="/choose" element={<ModeSelect />} />
            <Route path="/stock" element={<AllStock />} />

            {/* Commercial (all under /commercial, mirroring /domestic) */}
            <Route path="/" element={<Navigate to="/commercial" replace />} />
            <Route path="/commercial" element={<Home />} />
            <Route path="/commercial/customers" element={<Customers />} />
            <Route path="/commercial/customers/new" element={<AddCustomer />} />
            <Route path="/commercial/customers/:id" element={<CustomerDetail />} />
            <Route path="/commercial/sale" element={<NewSale />} />
            <Route path="/commercial/customers/:id/sale" element={<NewSale />} />
            <Route path="/commercial/customers/:id/sale/:txId/edit" element={<NewSale />} />
            <Route path="/commercial/return" element={<LogReturn />} />
            <Route path="/commercial/customers/:id/return" element={<LogReturn />} />
            <Route path="/commercial/customers/:id/return/:txId/edit" element={<LogReturn />} />
            <Route path="/commercial/payment" element={<RecordPayment />} />
            <Route path="/commercial/customers/:id/payment" element={<RecordPayment />} />
            <Route path="/commercial/customers/:id/payment/:txId/edit" element={<RecordPayment />} />
            <Route path="/commercial/activity" element={<ActivityFeed />} />
            <Route path="/account/business" element={<BusinessDetails />} />
            <Route path="/account/pricing" element={<CylinderPricing />} />
            <Route path="/commercial/purchases" element={<Purchases />} />
            <Route path="/commercial/purchases/new" element={<RecordPurchase />} />
            <Route path="/commercial/purchases/:txId/edit" element={<RecordPurchase />} />
            <Route path="/commercial/godown" element={<Godown />} />
            <Route path="/commercial/godown/set-stock" element={<SetCurrentStock />} />

            {/* Domestic */}
            <Route path="/domestic" element={<DomesticHome />} />
            <Route path="/domestic/bill" element={<DomesticNewBill />} />
            <Route path="/domestic/stock" element={<DomesticStock />} />
            <Route path="/domestic/purchases" element={<DomesticPurchases />} />
            <Route path="/domestic/purchases/new" element={<DomesticRecordPurchase />} />
            <Route path="/domestic/history" element={<DomesticHistory />} />
            <Route path="/domestic/combos" element={<DomesticCombos />} />
          </Route>
        </Route>
      </Routes>
      {!hideNav && (isDomestic ? <DomesticNav /> : <BottomNav />)}
    </div>
  )
}
