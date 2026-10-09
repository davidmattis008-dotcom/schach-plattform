"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { isAppInstalled, markAppInstalled } from "@/lib/pwa-installation";

type InstallAppLinkProps = {
  children: ReactNode;
  className: string;
};

export function InstallAppLink({ children, className }: InstallAppLinkProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const syncInstalledState = () => setVisible(!isAppInstalled());
    const handleInstalled = () => {
      markAppInstalled();
      setVisible(false);
    };

    syncInstalledState();
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("pwa-installed", handleInstalled);
    window.addEventListener("storage", syncInstalledState);
    return () => {
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("pwa-installed", handleInstalled);
      window.removeEventListener("storage", syncInstalledState);
    };
  }, []);

  if (!visible) return null;

  return <Link href="/installieren" className={className}>{children}</Link>;
}
