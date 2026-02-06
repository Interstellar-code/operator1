import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Shell } from "@/components/layout/shell";
import { OverviewPage } from "@/pages/overview";
import { PlaceholderPage } from "@/pages/placeholder";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route
            path="/chat"
            element={
              <PlaceholderPage
                title="Chat"
                description="Real-time chat interface with markdown rendering, tool call display, and session management."
              />
            }
          />
          <Route
            path="/channels"
            element={
              <PlaceholderPage
                title="Channels"
                description="Manage messaging channels — WhatsApp, Telegram, Discord, Slack, Signal, and more."
              />
            }
          />
          <Route
            path="/instances"
            element={
              <PlaceholderPage
                title="Instances"
                description="Presence beacons from connected clients and nodes."
              />
            }
          />
          <Route
            path="/sessions"
            element={
              <PlaceholderPage
                title="Sessions"
                description="Inspect active sessions, view history, and adjust per-session defaults."
              />
            }
          />
          <Route
            path="/cron"
            element={
              <PlaceholderPage
                title="Cron Jobs"
                description="Schedule wakeups and recurring agent runs."
              />
            }
          />
          <Route
            path="/agents"
            element={
              <PlaceholderPage
                title="Agents"
                description="Manage agent workspaces, tools, and identities."
              />
            }
          />
          <Route
            path="/skills"
            element={
              <PlaceholderPage
                title="Skills"
                description="Browse available skills and manage API key injection."
              />
            }
          />
          <Route
            path="/nodes"
            element={
              <PlaceholderPage
                title="Nodes"
                description="Paired devices, capabilities, and command exposure."
              />
            }
          />
          <Route
            path="/config"
            element={
              <PlaceholderPage title="Config" description="Edit gateway configuration safely." />
            }
          />
          <Route
            path="/debug"
            element={
              <PlaceholderPage
                title="Debug"
                description="Gateway snapshots, events, and manual RPC calls."
              />
            }
          />
          <Route
            path="/logs"
            element={
              <PlaceholderPage title="Logs" description="Live tail of the gateway file logs." />
            }
          />
          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
