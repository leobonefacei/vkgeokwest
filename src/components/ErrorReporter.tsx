"use client";

import { useEffect, useRef, useMemo } from "react";

type ReporterProps = {
  /*  ⎯⎯ props are only provided on the global-error page ⎯⎯ */
  error?: Error & { digest?: string };
  reset?: () => void;
};

/** Check if the error is WebGL-related */
function isWebGLError(error?: Error): boolean {
  if (!error) return false;
  const msg = (error.message + (error.stack || "")).toLowerCase();
  return (
    msg.includes("webgl") ||
    msg.includes("web gl") ||
    msg.includes("gl context") ||
    msg.includes("rendering context") ||
    msg.includes("maplibre") ||
    msg.includes("maptiler") ||
    msg.includes("failed to initialize") ||
    msg.includes("canvas")
  );
}

export default function ErrorReporter({ error, reset }: ReporterProps) {
  /* ─ instrumentation shared by every route ─ */
  const lastOverlayMsg = useRef("");
  const pollRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const inIframe = window.parent !== window;
    if (!inIframe) return;

    const send = (payload: unknown) => window.parent.postMessage(payload, "*");

    const onError = (e: ErrorEvent) =>
      send({
        type: "ERROR_CAPTURED",
        error: {
          message: e.message,
          stack: e.error?.stack,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
          source: "window.onerror",
        },
        timestamp: Date.now(),
      });

    const onReject = (e: PromiseRejectionEvent) =>
      send({
        type: "ERROR_CAPTURED",
        error: {
          message: e.reason?.message ?? String(e.reason),
          stack: e.reason?.stack,
          source: "unhandledrejection",
        },
        timestamp: Date.now(),
      });

    const pollOverlay = () => {
      const overlay = document.querySelector("[data-nextjs-dialog-overlay]");
      const node =
        overlay?.querySelector(
          "h1, h2, .error-message, [data-nextjs-dialog-body]"
        ) ?? null;
      const txt = node?.textContent ?? node?.innerHTML ?? "";
      if (txt && txt !== lastOverlayMsg.current) {
        lastOverlayMsg.current = txt;
        send({
          type: "ERROR_CAPTURED",
          error: { message: txt, source: "nextjs-dev-overlay" },
          timestamp: Date.now(),
        });
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onReject);
    pollRef.current = setInterval(pollOverlay, 1000);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onReject);
      pollRef.current && clearInterval(pollRef.current);
    };
  }, []);

  /* ─ extra postMessage when on the global-error route ─ */
  useEffect(() => {
    if (!error) return;
    window.parent.postMessage(
      {
        type: "global-error-reset",
        error: {
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          name: error.name,
        },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
      },
      "*"
    );
  }, [error]);

  /* ─ ordinary pages render nothing ─ */
  if (!error) return null;

  const webglError = isWebGLError(error);

  /* ─ global-error UI (localized) ─ */
  return (
    <html lang="ru">
      <body style={{
        minHeight: '100vh',
        margin: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        color: '#1e293b',
      }}>
        <div style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{
            width: '80px',
            height: '80px',
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: webglError ? '#fef3c7' : '#fee2e2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '36px',
          }}>
            {webglError ? '🖥️' : '⚠️'}
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: '22px',
            fontWeight: 700,
            margin: '0 0 8px',
            color: webglError ? '#92400e' : '#dc2626',
          }}>
            {webglError
              ? 'Карта не поддерживается'
              : 'Произошла ошибка'}
          </h1>

          {/* Description */}
          <p style={{
            fontSize: '15px',
            color: '#64748b',
            margin: '0 0 24px',
            lineHeight: 1.5,
          }}>
            {webglError ? (
              <>
                Ваш браузер или устройство не поддерживает технологию <strong>WebGL2</strong>, необходимую для отображения карты.
                <br /><br />
                Попробуйте открыть приложение в другом браузере (Google Chrome, Safari) или на другом устройстве.
              </>
            ) : (
              'Что-то пошло не так. Попробуйте перезагрузить приложение.'
            )}
          </p>

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
            {reset && (
              <button
                onClick={reset}
                style={{
                  padding: '12px 32px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#4f46e5',
                  color: 'white',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: '280px',
                }}
              >
                Попробовать снова
              </button>
            )}

            {webglError && (
              <a
                href="https://get.webgl.org/webgl2/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '10px 24px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  background: 'white',
                  color: '#4f46e5',
                  fontSize: '14px',
                  fontWeight: 500,
                  textDecoration: 'none',
                  display: 'inline-block',
                  width: '100%',
                  maxWidth: '280px',
                  boxSizing: 'border-box',
                }}
              >
                Проверить поддержку WebGL2
              </a>
            )}
          </div>

          {/* Dev details */}
          {process.env.NODE_ENV === "development" && (
            <details style={{ marginTop: '24px', textAlign: 'left' }}>
              <summary style={{ cursor: 'pointer', fontSize: '13px', color: '#94a3b8' }}>
                Подробности ошибки
              </summary>
              <pre style={{
                marginTop: '8px',
                fontSize: '11px',
                background: '#f1f5f9',
                padding: '12px',
                borderRadius: '8px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}>
                {error.message}
                {error.stack && `\n\n${error.stack}`}
                {error.digest && `\n\nDigest: ${error.digest}`}
              </pre>
            </details>
          )}
        </div>
      </body>
    </html>
  );
}
