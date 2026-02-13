import type { ReactNode } from "react";

export const infoContent: Record<string, { title: string; body: ReactNode }> = {
  missionControl: {
    title: "Mission Control",
    body: (
      <>
        <p>
          Real-time overview of your entire OpenClaw deployment. The status
          bar shows live metrics aggregated from the gateway connection.
        </p>
        <h4>What You See</h4>
        <ul>
          <li><strong>Agents</strong> &mdash; total agent definitions loaded from your config.</li>
          <li><strong>Active</strong> &mdash; sessions currently in a &ldquo;running&rdquo; state (processing a request or tool call).</li>
          <li><strong>Tasks open</strong> &mdash; task items that are not &ldquo;done&rdquo; or &ldquo;cancelled&rdquo;.</li>
          <li><strong>Cron jobs</strong> &mdash; enabled scheduled jobs.</li>
        </ul>
        <h4>Status Indicator</h4>
        <ul>
          <li><strong>Live</strong> (green) &mdash; WebSocket connected and receiving events.</li>
          <li><strong>Connecting</strong> (amber, pulsing) &mdash; establishing or re-establishing the connection.</li>
          <li><strong>Offline</strong> (red) &mdash; disconnected. Check gateway is running.</li>
        </ul>
      </>
    ),
  },

  agentFleet: {
    title: "Agent Fleet",
    body: (
      <>
        <p>
          Lists every agent in your deployment with its current status
          derived from gateway session events.
        </p>
        <h4>What You See</h4>
        <ul>
          <li><strong>Agent name</strong> &mdash; the <code>agentId</code> from your config.</li>
          <li><strong>Session count</strong> &mdash; how many active sessions belong to this agent.</li>
          <li><strong>Status dot</strong> &mdash; green if running, grey if idle.</li>
        </ul>
        <h4>How It Works</h4>
        <p>
          Agent identity is resolved by matching <code>sessionKey</code> patterns
          against registered agent IDs (mirroring the Studio approach). If the
          gateway sends a session key like <code>agent:w1le:main</code>, the fleet
          maps it to agent &ldquo;w1le&rdquo;.
        </p>
        <h4>Common Gotchas</h4>
        <ul>
          <li>An agent may briefly show &ldquo;running&rdquo; after a run ends if the terminal event was missed. The reconciler (polling every 3 s) will correct this automatically.</li>
          <li>If an agent name shows as &ldquo;main&rdquo; or a Telegram ID, the session key didn&apos;t match any known agent &mdash; check your config.</li>
        </ul>
      </>
    ),
  },

  taskBoard: {
    title: "Task Board",
    body: (
      <>
        <p>
          Kanban-style view of task items defined in your project&apos;s
          task files (<code>~/.openclaw/tasks/</code>).
        </p>
        <h4>Columns</h4>
        <ul>
          <li><strong>Inbox</strong> &mdash; unassigned or newly created tasks.</li>
          <li><strong>Assigned</strong> &mdash; linked to an agent but not yet started.</li>
          <li><strong>In Progress</strong> &mdash; actively being worked on (includes &ldquo;blocked&rdquo; tasks).</li>
          <li><strong>Review</strong> &mdash; completed by the agent, awaiting human review.</li>
          <li><strong>Done</strong> &mdash; finished tasks.</li>
        </ul>
        <h4>How to Read It</h4>
        <p>
          Task statuses are read from the filesystem context API and refreshed
          on a polling interval. Drag-and-drop is not supported; status changes
          come from agent activity or manual file edits.
        </p>
        <h4>Common Gotchas</h4>
        <ul>
          <li>Tasks only appear if they exist in the configured task directory.</li>
          <li>A &ldquo;blocked&rdquo; task is grouped under In Progress.</li>
        </ul>
      </>
    ),
  },

  activityFeed: {
    title: "Activity Feed",
    body: (
      <>
        <p>
          Chronological stream of all events from the gateway plus
          persisted activity history from the Activity Tracker.
        </p>
        <h4>Entry Types</h4>
        <ul>
          <li><strong>Lifecycle</strong> &mdash; session start/end events, run creation, errors.</li>
          <li><strong>Tool</strong> &mdash; tool call and tool result events (e.g. file edits, searches).</li>
          <li><strong>Assistant</strong> &mdash; agent text output and streaming tokens.</li>
          <li><strong>Chat</strong> &mdash; user/human messages.</li>
        </ul>
        <h4>Data Sources</h4>
        <ul>
          <li><strong>Live</strong> &mdash; real-time events from the gateway WebSocket.</li>
          <li><strong>Persisted</strong> &mdash; historical activity records loaded from <code>/api/activity</code> on page load (shown with a &ldquo;persisted&rdquo; badge).</li>
          <li><strong>Reconciled</strong> &mdash; synthetic entries injected by the reconciler when a missed run-end is detected.</li>
        </ul>
        <h4>Common Gotchas</h4>
        <ul>
          <li>If the gateway disconnects and reconnects, a gap recovery sync runs automatically to fill in missed events.</li>
          <li>Entries may appear out of order briefly during gap recovery.</li>
          <li>Click an activity entry to open the detail drawer with full metadata and event timeline.</li>
        </ul>
      </>
    ),
  },

  liveOutput: {
    title: "Live Output",
    body: (
      <>
        <p>
          Shows real-time streaming text from the currently active agent session.
          This panel only appears when at least one session is in &ldquo;running&rdquo; state.
        </p>
        <h4>What You See</h4>
        <ul>
          <li><strong>Agent name</strong> and <strong>origin</strong> badge (interactive, cron, heartbeat).</li>
          <li><strong>Streaming text</strong> &mdash; the last ~1000 characters of the agent&apos;s current output.</li>
          <li><strong>Tool name</strong> &mdash; if the agent is executing a tool, the tool name and a preview of its arguments are shown.</li>
        </ul>
        <h4>How to Read It</h4>
        <p>
          Text updates in real time via the gateway event stream. When the agent
          finishes, this panel disappears and a summary entry appears in the
          Activity Feed below.
        </p>
      </>
    ),
  },

  cronSchedule: {
    title: "Cron Schedule",
    body: (
      <>
        <p>
          Displays all cron (scheduled) jobs registered with the gateway,
          including disabled ones.
        </p>
        <h4>What Each Row Shows</h4>
        <ul>
          <li><strong>Job name</strong> &mdash; human-readable identifier for the scheduled task.</li>
          <li><strong>Agent</strong> &mdash; which agent executes this job.</li>
          <li><strong>Enabled/Disabled</strong> &mdash; whether the job is active.</li>
          <li><strong>Next run</strong> &mdash; when the job will fire next (relative time).</li>
          <li><strong>Last run</strong> &mdash; when it last executed (relative time).</li>
        </ul>
        <h4>Status Meanings</h4>
        <ul>
          <li><strong>ok</strong> &mdash; last run completed successfully.</li>
          <li><strong>error</strong> &mdash; last run failed. Check agent logs for details.</li>
          <li><strong>skipped</strong> &mdash; run was skipped (e.g. previous run still in progress).</li>
        </ul>
        <h4>Common Gotchas</h4>
        <ul>
          <li>A &ldquo;running&rdquo; indicator means a cron job is currently executing. It will clear when the run finishes.</li>
          <li>Cron data is refreshed every 30 seconds automatically.</li>
          <li>If no cron jobs are configured, this panel will show &ldquo;No cron jobs.&rdquo;</li>
        </ul>
      </>
    ),
  },

  routingTable: {
    title: "Routing Table",
    body: (
      <>
        <p>
          Shows the domain-to-agent mapping from your project&apos;s
          configuration. This determines which agents handle requests for
          specific domains or services.
        </p>
        <h4>What You See</h4>
        <ul>
          <li><strong>Domain</strong> &mdash; the domain pattern or service key.</li>
          <li><strong>Agents</strong> &mdash; which agent(s) are assigned to handle this domain.</li>
        </ul>
        <h4>How to Read It</h4>
        <p>
          When a message arrives from a particular domain (e.g. a Telegram
          channel, a web hook, or an API endpoint), the routing table determines
          which agent processes it. Multiple agents can be assigned to the same
          domain.
        </p>
        <h4>Common Gotchas</h4>
        <ul>
          <li>If a domain shows no agents, incoming messages for that domain will be unhandled.</li>
          <li>Routing is configured in your OpenClaw project files and only updates when the config is reloaded.</li>
        </ul>
      </>
    ),
  },

  signals: {
    title: "Signals",
    body: (
      <>
        <p>
          Aggregated view of special, non-conversational events: heartbeat
          check-in responses and recent cron run results.
        </p>
        <h4>Heartbeats</h4>
        <ul>
          <li>Each entry shows the <strong>agent name</strong>, <strong>when</strong> it last responded, and a <strong>snippet</strong> of its heartbeat reply.</li>
          <li>Heartbeat responses are extracted from the agent&apos;s chat history by finding the latest assistant reply to a heartbeat prompt.</li>
          <li>Click a heartbeat entry to filter the activity feed to that session.</li>
        </ul>
        <h4>Cron Runs</h4>
        <ul>
          <li>Shows the most recent cron executions, sorted by recency.</li>
          <li>Green dot = last run succeeded. Red dot = last run errored.</li>
        </ul>
        <h4>Common Gotchas</h4>
        <ul>
          <li>This panel is hidden if there are no heartbeat sessions and no recent cron runs.</li>
          <li>Heartbeat data refreshes whenever sessions are refreshed (on connect, gap recovery, or presence events).</li>
          <li>Collapse state is saved to localStorage so your preference persists across reloads.</li>
        </ul>
      </>
    ),
  },

  syncStatus: {
    title: "Sync Status",
    body: (
      <>
        <p>
          Indicates whether Mission Control is currently synchronizing state
          with the gateway and when the last successful sync occurred.
        </p>
        <h4>What &ldquo;Syncing&rdquo; Does</h4>
        <ul>
          <li>Calls <code>sessions.list</code> to refresh all known sessions and their agents.</li>
          <li>Calls <code>sessions.preview</code> to fetch recent message previews for active sessions.</li>
          <li>Updates the agent identity map used to resolve session keys to real agent names.</li>
        </ul>
        <h4>When Sync Happens</h4>
        <ul>
          <li><strong>On connect</strong> &mdash; initial sync when the gateway WebSocket connects.</li>
          <li><strong>On gap</strong> &mdash; if the event stream detects a sequence gap, a full sync runs automatically.</li>
          <li><strong>Presence events</strong> &mdash; session refresh is throttled on presence updates.</li>
        </ul>
        <h4>Common Gotchas</h4>
        <ul>
          <li>If &ldquo;Last synced&rdquo; is stale, the gateway may have disconnected. Check the status indicator in the header.</li>
        </ul>
      </>
    ),
  },

  catchUpDigest: {
    title: "Catch-Up Digest",
    body: (
      <>
        <p>
          Summarizes what happened while you were away, based on activity records
          since your last visit.
        </p>
        <h4>What You See</h4>
        <ul>
          <li><strong>Per-agent breakdown</strong> &mdash; conversations, cron runs, and errors for each agent.</li>
          <li><strong>Channels</strong> &mdash; which communication channels (Telegram, web, etc.) were active.</li>
          <li><strong>Totals</strong> &mdash; overall message count, error count, and average response time.</li>
        </ul>
        <h4>How It Works</h4>
        <p>
          On page load, Mission Control checks your last-seen timestamp
          (stored in localStorage) and fetches a digest of activity since
          then from <code>/api/activity/digest</code>. If you&apos;ve never visited,
          it defaults to the last 24 hours.
        </p>
        <h4>Dismissing</h4>
        <p>
          Click the &times; button to dismiss. This also updates your last-seen
          timestamp so the next visit starts fresh.
        </p>
      </>
    ),
  },
};
