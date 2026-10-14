import { useEffect, useState, useRef } from "react"

// This is a Vite SPA: once loaded, a browser tab keeps running the exact JS
// bundle it started with, forever -- a new deploy never reaches a tab left
// open across it. That's exactly how the Order Location field silently went
// missing from most Order Status submissions (see EnquiryTrackerForm.jsx):
// almost every tab in use was still running yesterday's bundle, which
// doesn't have that field at all. This banner polls the build id each
// deploy stamps into dist/version.json (vite.config.js) and compares it to
// the id this tab's own bundle shipped with (__BUILD_ID__, also set there)
// -- when they differ, a new build has gone out since this tab was loaded.
const CHECK_INTERVAL_MS = 5 * 60 * 1000

async function fetchLatestBuildId() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
    if (!res.ok) return null
    const data = await res.json()
    return data.buildId || null
  } catch {
    return null
  }
}

function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const checkingRef = useRef(false)

  useEffect(() => {
    const check = async () => {
      if (checkingRef.current) return
      checkingRef.current = true
      const latest = await fetchLatestBuildId()
      checkingRef.current = false
      if (latest && latest !== __BUILD_ID__) {
        setUpdateAvailable(true)
      }
    }

    check()
    const interval = setInterval(check, CHECK_INTERVAL_MS)

    // Also check the moment a long-idle tab gets focus again -- the most
    // common way someone actually ends up stuck on a stale bundle.
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  if (!updateAvailable) return null

  return (
    <div
      role="status"
      className="flex shrink-0 items-center justify-center gap-3 border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm font-medium text-warning-foreground"
    >
      <span>A new version of this app is available. Please refresh to get the latest updates.</span>
      <button
        onClick={() => window.location.reload()}
        className="rounded-md bg-primary px-3 py-1 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Refresh now
      </button>
    </div>
  )
}

export default UpdateBanner
