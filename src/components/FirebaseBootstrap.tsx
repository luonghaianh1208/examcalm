"use client";

import { useEffect } from "react";
import { startAppCheck } from "@/lib/firebase/client";

export function FirebaseBootstrap() {
  useEffect(() => {
    startAppCheck();
  }, []);
  return null;
}
