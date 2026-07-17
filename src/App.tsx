import { Routes, Route, useLocation } from 'react-router-dom'
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
  const hideNav = location.pathname === '/login' || location.pathname === '/choose'

  return (
    <div className="min-h-screen bg-cream pb-16">
      <ConnectionBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<ModeGate />}>
            <Route path="/choose" element={<ModeSelect />} />

            {/* Commercial */}
            <Route path="/" element={<Home />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/new" element={<AddCustomer />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/sale" element={<NewSale />} />
            <Route path="/customers/:id/sale" element={<NewSale />} />
            <Route path="/customers/:id/sale/:txId/edit" element={<NewSale />} />
            <Route path="/return" element={<LogReturn />} />
            <Route path="/customers/:id/return" element={<LogReturn />} />
            <Route path="/customers/:id/return/:txId/edit" element={<LogReturn />} />
            <Route path="/payment" element={<RecordPayment />} />
            <Route path="/customers/:id/payment" element={<RecordPayment />} />
            <Route path="/customers/:id/payment/:txId/edit" element={<RecordPayment />} />
            <Route path="/activity" element={<ActivityFeed />} />
            <Route path="/account/business" element={<BusinessDetails />} />
            <Route path="/account/pricing" element={<CylinderPricing />} />
            <Route path="/purchases" element={<Purchases />} />
            <Route path="/purchases/new" element={<RecordPurchase />} />
            <Route path="/purchases/:txId/edit" element={<RecordPurchase />} />
            <Route path="/godown" element={<Godown />} />
            <Route path="/godown/set-stock" element={<SetCurrentStock />} />

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
