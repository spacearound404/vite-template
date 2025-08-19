import React from "react";
import { useAuth } from "@/auth";

export function AuthBadge() {
  const { user, loading, error } = useAuth();
  if (loading) return null;
  return null;
}


