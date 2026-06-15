import React from "react";
import { useSender } from "../hooks/useSender.js";

import DropZone from "@letshare/core/components/ui/DropZone";
import ReceiverCard from "@letshare/core/components/ui/ReceiverCard";
import SessionSummary from "@letshare/core/components/ui/SessionSummary";
import StatusBadge from "@letshare/core/components/ui/StatusBadge";
import ShareLinkBox from "../components/ui/ShareLinkBox.jsx";

function phaseToStatus(phase) {
  if (phase === "done") return "connected";
  if (phase === "waiting") return "connecting";
  if (phase === "active") return "connected";
  return "idle";
}

export default function SendPage() {
  const {
    state,
    selectedFiles,
    handleFilesSelected,
    createSession,
    copyLink,
    reset,
  } = useSender();
  const { phase, shareLink, statusText, receivers, fileList, totalSize } =
    state;
  const isLocked = phase === "waiting" || phase === "active";
  const showReset = phase === "done" || phase === "error";
  const activeCount = receivers.filter((r) => r.phase !== "error").length;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="font-heading font-bold text-3xl text-ink tracking-tight">
          Send Files
        </h1>
        <p className="text-ink-muted mt-1 text-sm">
          Select files or a folder — multiple receivers can connect to the same
          link simultaneously.
        </p>
      </div>

      <div className="card p-6 space-y-5">
        <DropZone
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          disabled={isLocked}
        />

        <button
          onClick={createSession}
          disabled={!selectedFiles.length || isLocked}
          className="btn-primary w-full py-3.5"
        >
          {phase === "waiting" ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              Waiting for receivers…
            </>
          ) : phase === "active" ? (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"
                />
              </svg>
              {activeCount} receiver{activeCount !== 1 ? "s" : ""} connected
            </>
          ) : phase === "done" ? (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              All done!
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.8}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Create Share Link
            </>
          )}
        </button>

        <div className="flex items-center justify-between">
          <StatusBadge type={phaseToStatus(phase)} label={statusText} />
          {showReset && (
            <button
              onClick={reset}
              className="btn-secondary text-xs py-1.5 px-3"
            >
              Start Over
            </button>
          )}
        </div>
      </div>

      {shareLink && <ShareLinkBox link={shareLink} onCopy={copyLink} />}

      {phase === "done" && receivers.length > 0 && (
        <SessionSummary
          receivers={receivers}
          totalSize={totalSize}
          fileList={fileList}
        />
      )}

      {receivers.length > 0 && (
        <div className="space-y-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="font-heading font-semibold text-xs text-ink-muted uppercase tracking-wider">
              Receivers
            </h2>
            <span className="text-xs text-ink-faint">
              {receivers.filter((r) => r.phase === "done").length} /{" "}
              {receivers.length} complete
            </span>
          </div>
          {receivers.map((r) => (
            <ReceiverCard
              key={r.socketId}
              receiver={r}
              fileList={fileList}
              totalSize={totalSize}
            />
          ))}
        </div>
      )}

      {fileList.length > 0 && phase !== "idle" && (
        <div className="card overflow-hidden animate-slide-up">
          <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
            <span className="font-semibold text-sm text-ink">
              {state.selectionMode === "folder"
                ? "Folder Contents"
                : "Files to Share"}
            </span>
            <span className="text-xs text-ink-muted">
              {fileList.length} files
            </span>
          </div>
          <div className="divide-y divide-surface-border max-h-52 overflow-y-auto">
            {fileList.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-2.5">
                <svg
                  className="w-3.5 h-3.5 text-ink-faint flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.8}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span
                  className="text-xs text-ink truncate flex-1 font-mono"
                  title={f.path}
                >
                  {f.path}
                </span>
                <span className="text-xs text-ink-faint font-mono flex-shrink-0">
                  {(f.size / 1024).toFixed(1)} KB
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
