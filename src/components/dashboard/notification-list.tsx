"use client";

import Link from "next/link";
import { useState } from "react";

type Notification = {
  id: string;
  title: string;
  body: string;
  actionHref: string | null;
};

export function NotificationList({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);

  async function dismiss(id: string) {
    const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    if (response.ok) setNotifications((current) => current.filter((notification) => notification.id !== id));
  }

  if (notifications.length === 0) return null;
  return (
    <section className="athlemetry-card p-5 md:p-6" aria-labelledby="notifications-heading">
      <h2 id="notifications-heading" className="text-lg font-semibold tracking-tight text-slate-950">Next actions</h2>
      <div className="mt-4 space-y-3">
        {notifications.map((notification) => (
          <article key={notification.id} className="athlemetry-panel-item flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-semibold text-slate-900">{notification.title}</h3><p className="mt-1 text-sm text-slate-600">{notification.body}</p></div>
            <div className="flex shrink-0 items-center gap-3">
              {notification.actionHref ? <Link className="text-sm font-semibold text-teal-800" href={notification.actionHref}>Open</Link> : null}
              <button type="button" className="text-sm text-slate-500" onClick={() => dismiss(notification.id)}>Dismiss</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
