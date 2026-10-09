export async function clearOfflineDay() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) await new Promise<void>(resolve => {
      const channel = new MessageChannel(); const timer = setTimeout(resolve, 3000);
      channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
      registration.active!.postMessage({ type: "CLEAR_DAY" }, [channel.port2]);
    });
  }
  if ("caches" in window) { await caches.delete("afaire-day-v1"); await caches.delete("afaire-changes-v1"); }
}

export function openOfflinePlanner() {
  // The service worker serves the editor on document navigation, not an RSC fetch.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/?offline=1");
}
