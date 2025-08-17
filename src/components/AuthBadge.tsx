import React from "react";
import { useAuth } from "@/auth";

export function AuthBadge() {
  const { user, loading, error } = useAuth();
  if (loading) return null;
  return (
    <div className="ml-auto text-xs text-default-500">
      {error ? (
        <span className="text-red-500">auth error</span>
      ) : user ? (
        <span>Telegram: signed in</span>
      ) : (
        null
      )}
    </div>
  );
}


