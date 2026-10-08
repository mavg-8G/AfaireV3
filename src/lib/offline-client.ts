export async function clearOfflineDay() {
  if ("serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration?.active) await new Promise<void>(resolve => {
      const channel = new MessageChannel(); const timer = setTimeout(resolve, 3000);
      channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
      registration.active!.postMessage({ type: "CLEAR_DAY" }, [channel.port2]);
    });
  }
  if ("caches" in window) await caches.delete("afaire-day-v1");
}
