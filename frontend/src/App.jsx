import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import CustomersPage from "./pages/CustomersPage.jsx";
import ClientConfigPage from "./pages/ClientConfigPage.jsx";
import VehicleDispatchPage from "./pages/VehicleDispatchPage.jsx";
import Scanner from "./pages/Scanner.jsx";
import RoutingPage from "./pages/RoutingPage.jsx";
import ExtensionPage from "./pages/ExtensionPage.jsx";

const RootRedirect = () => {
  const { auth } = useAuth();
  if (!auth) return <Navigate to="/login" replace />;
  if (auth.role === "admin") return <Navigate to="/admin" replace />;
  return <Navigate to="/scanner" replace />;
};

const App = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/login" element={<Login />} />

          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <CustomersPage />
            </ProtectedRoute>
          } />

          <Route path="/admin/client/:customerId" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <ClientConfigPage />
            </ProtectedRoute>
          } />

          <Route path="/admin/vehicle" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <VehicleDispatchPage />
            </ProtectedRoute>
          } />

          <Route path="/routing" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <RoutingPage />
            </ProtectedRoute>
          } />

          <Route path="/extension" element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <ExtensionPage />
            </ProtectedRoute>
          } />

          <Route path="/scanner" element={
            <ProtectedRoute allowedRoles={["admin", "loader"]}>
              <Scanner />
            </ProtectedRoute>
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
