"use client";

import Script from "next/script";
import { useEffect } from "react";

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "";
const DEFAULT_AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT || "";

export default function AdSenseAd({
  slot = DEFAULT_AD_SLOT,
  label = "Sponsored",
  className = "",
}) {
  useEffect(() => {
    if (!ADSENSE_CLIENT || !slot) return;

    try {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.push({});
    } catch {
      // Ad blockers or delayed AdSense setup can throw; the app should keep working.
    }
  }, [slot]);

  if (!ADSENSE_CLIENT || !slot) return null;

  return (
    <>
      <Script
        async
        id="google-adsense"
        strategy="afterInteractive"
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
      />
      <aside
        className={`rounded-[1rem] border border-white/8 bg-white/[0.025] px-3 py-3 ${className}`}
        aria-label={label}
      >
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.24em] text-white/28">
          {label}
        </p>
        <ins
          className="adsbygoogle"
          style={{ display: "block" }}
          data-ad-client={ADSENSE_CLIENT}
          data-ad-slot={slot}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </aside>
    </>
  );
}
