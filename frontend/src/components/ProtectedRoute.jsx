import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

// Wraps a page and only renders it if the user is logged in AND
// has one of the allowedRoles. Otherwise redirects to /login or
// to the scanner page (if logged in but wrong role).
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { auth } = useAuth();

  if (!auth) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(auth.role)) {
    // Logged in but not allowed here (e.g. loader trying to reach admin panel)
    return <Navigate to="/scanner" replace />;
  }

  return children;
};

export default ProtectedRoute;
