"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useT } from "@/lib/i18n";

/** Target of the button in a notification email: mark it read, switch to its workspace if needed, go to the page. */
export default function OpenNotification({ id }) {
  const tr = useT();
  const router = useRouter();
  const { user, switchProfile } = useAuth();
  const mine = user?.profile_id;
  useEffect(() => {
    let alive = true;
    api.put(`/api/notifications/${Number(id) || 0}`, { read: true })
      .then((n) => {
        if (!alive) return;
        const href = n.href || "/notifications";
        if (n.profile_id && mine && n.profile_id !== mine) return switchProfile(n.profile_id, href);
        router.replace(href);
      })
      .catch(() => alive && router.replace("/notifications")); // deleted meanwhile, or somebody else's
    return () => { alive = false; };
  }, [id, mine, router, switchProfile]);
  return <p className="p-6 text-sm text-fg-muted">{tr("Opening…")}</p>;
}
