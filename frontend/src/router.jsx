import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';

// Public pages
import { Landing } from './pages/Landing';
import { Login } from './pages/Login';
import { Register } from './pages/Register';

// Buyer pages
import { BuyerDashboard } from './pages/buyer/BuyerDashboard';
import { PostRequirement } from './pages/buyer/PostRequirement';
import { SmartMatching } from './pages/buyer/SmartMatching';
import { Marketplace } from './pages/buyer/Marketplace';
import { ListingDetail } from './pages/buyer/ListingDetail';
import { TransactionDetail } from './pages/buyer/TransactionDetail';
import { ShipmentTracking } from './pages/buyer/ShipmentTracking';
import { ActiveMap } from './pages/buyer/ActiveMap';
import { Notifications } from './pages/buyer/Notifications';
import { Profile } from './pages/Profile';
import { OrdersList } from './pages/buyer/OrdersList';

// Seller pages
import { SellerDashboard } from './pages/seller/SellerDashboard';
import { RegisterBatch } from './pages/seller/RegisterBatch';
import { Inventory } from './pages/seller/Inventory';
import { CreateListing } from './pages/seller/CreateListing';
import { Auctions } from './pages/seller/Auctions';
import { AuctionDetail } from './pages/seller/AuctionDetail';
import { SellerShipments } from './pages/seller/SellerShipments';
import { Logistics } from './pages/seller/Logistics';
import { Documents } from './pages/seller/Documents';
import { SellerOrders } from './pages/seller/SellerOrders';

// Admin pages
import { AdminDashboard } from './pages/admin/AdminDashboard';

export const router = createBrowserRouter([
  // Public routes
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/register', element: <Register /> },

  // Authenticated routes
  {
    element: <AppShell />,
    children: [
      // Buyer routes
      { path: '/dashboard', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><BuyerDashboard /></ProtectedRoute> },
      { path: '/requirements/new', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><PostRequirement /></ProtectedRoute> },
      { path: '/matching/:id', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><SmartMatching /></ProtectedRoute> },
      { path: '/marketplace', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><Marketplace /></ProtectedRoute> },
      { path: '/listings/:id', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><ListingDetail /></ProtectedRoute> },
      { path: '/orders', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><OrdersList /></ProtectedRoute> },
      { path: '/orders/:id', element: <ProtectedRoute allowedRoles={['BUYER', 'SELLER', 'ADMIN']}><TransactionDetail /></ProtectedRoute> },
      { path: '/shipments', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><ShipmentTracking /></ProtectedRoute> },
      { path: '/map', element: <ProtectedRoute allowedRoles={['BUYER', 'ADMIN']}><ActiveMap /></ProtectedRoute> },
      { path: '/notifications', element: <ProtectedRoute allowedRoles={['BUYER', 'SELLER', 'ADMIN']}><Notifications /></ProtectedRoute> },
      { path: '/profile', element: <ProtectedRoute allowedRoles={['BUYER', 'SELLER', 'ADMIN']}><Profile /></ProtectedRoute> },

      // Seller routes
      { path: '/seller/dashboard', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><SellerDashboard /></ProtectedRoute> },
      { path: '/seller/batches/new', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><RegisterBatch /></ProtectedRoute> },
      { path: '/seller/inventory', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><Inventory /></ProtectedRoute> },
      { path: '/seller/listings/new', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><CreateListing /></ProtectedRoute> },
      { path: '/seller/auctions', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><Auctions /></ProtectedRoute> },
      { path: '/seller/auctions/:id', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><AuctionDetail /></ProtectedRoute> },
      { path: '/seller/orders', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><SellerOrders /></ProtectedRoute> },
      { path: '/seller/orders/:id', element: <ProtectedRoute allowedRoles={['BUYER', 'SELLER', 'ADMIN']}><TransactionDetail /></ProtectedRoute> },
      { path: '/seller/shipments', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><SellerShipments /></ProtectedRoute> },
      { path: '/seller/logistics', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><Logistics /></ProtectedRoute> },
      { path: '/seller/documents', element: <ProtectedRoute allowedRoles={['SELLER', 'ADMIN']}><Documents /></ProtectedRoute> },

      // Admin routes
      { path: '/admin/dashboard', element: <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute> },
    ],
  },

  // Catch all
  { path: '*', element: <Navigate to="/" replace /> },
]);

