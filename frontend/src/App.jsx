import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import AdminPanel from "./pages/AdminPanel.jsx";
import Scanner from "./pages/Scanner.jsx";

// Redirects "/" to the right place depending on login state and role
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

          {/* Admin-only page */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["admin"]}>
                <AdminPanel />
              </ProtectedRoute>
            }
          />

          {/* Accessible by both admin and loader */}
          <Route
            path="/scanner"
            element={
              <ProtectedRoute allowedRoles={["admin", "loader"]}>
                <Scanner />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
