import { useEffect, useState } from "react";
import type { MeshConfig, YRoom } from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Fix = { name: string; lat: number; lon: number; accuracy: number; ts: number };

const NAME_KEY = (prefix: string) => `${prefix}:displayName`;
const SHARE_KEY = (prefix: string) => `${prefix}:sharing`;

const COLORS = ["#fb923c", "#38bdf8", "#a3e635", "#f472b6", "#a855f7", "#facc15"];

function colorFor(peerId: string): string {
  let h = 0;
  for (let i = 0; i < peerId.length; i++) h = (h * 31 + peerId.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

function haversine(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="ffm-screen">
        <h1>find my family</h1>
        <p className="ffm-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [sharing, setSharing] = useState(
    () => localStorage.getItem(SHARE_KEY(config.storagePrefix)) === "1",
  );
  const [permError, setPermError] = useState<string | null>(null);
  const [, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  useEffect(() => {
    localStorage.setItem(SHARE_KEY(config.storagePrefix), sharing ? "1" : "0");
  }, [sharing, config.storagePrefix]);

  useEffect(() => {
    const fixes = room.doc.getMap<Fix>("fixes");
    const onChange = () => rerender((n) => n + 1);
    fixes.observe(onChange);
    return () => fixes.unobserve(onChange);
  }, [room]);

  const fixes = room.doc.getMap<Fix>("fixes");

  // Geolocation watch — only when sharing is on
  useEffect(() => {
    if (!sharing || !name.trim()) {
      // remove my fix on stop
      fixes.delete(room.peerId);
      return;
    }
    if (!("geolocation" in navigator)) {
      setPermError("geolocation not supported in this browser");
      setSharing(false);
      return;
    }
    setPermError(null);
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        fixes.set(room.peerId, {
          name: name.trim(),
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          ts: Date.now(),
        });
      },
      (err) => {
        setPermError(err.message);
        setSharing(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(id);
      fixes.delete(room.peerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharing, name, room]);

  const fixList: Array<Fix & { peerId: string }> = [];
  fixes.forEach((v, k) => fixList.push({ ...v, peerId: k }));
  fixList.sort((a, b) => b.ts - a.ts);

  // Compute bounds for SVG preview
  const W = 360;
  const H = 280;
  let viewBox = `0 0 ${W} ${H}`;
  let projected: Array<{ peerId: string; x: number; y: number; fix: Fix }> = [];
  if (fixList.length > 0) {
    const lats = fixList.map((f) => f.lat);
    const lons = fixList.map((f) => f.lon);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLon = Math.min(...lons);
    let maxLon = Math.max(...lons);
    const dLat = maxLat - minLat || 0.001;
    const dLon = maxLon - minLon || 0.001;
    const pad = 0.15;
    minLat -= dLat * pad;
    maxLat += dLat * pad;
    minLon -= dLon * pad;
    maxLon += dLon * pad;
    projected = fixList.map((f) => ({
      peerId: f.peerId,
      x: ((f.lon - minLon) / (maxLon - minLon)) * W,
      y: H - ((f.lat - minLat) / (maxLat - minLat)) * H,
      fix: f,
    }));
  }

  const myFix = fixes.get(room.peerId);

  return (
    <div className="ffm-screen">
      <header className="ffm-header">
        <h1>find my family</h1>
        <p className="ffm-status">
          {fixList.length} {fixList.length === 1 ? "person sharing" : "people sharing"} ·{" "}
          {room.peerCount + 1} present
        </p>
      </header>

      <div className="ffm-privacy">
        <p>
          opt-in only. locations are stored ephemerally in the mesh while this tab is open — close
          the tab to stop sharing. nothing is sent to any server.
        </p>
      </div>

      <div className="ffm-controls">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="your name"
          maxLength={48}
          aria-label="your name"
          className="ffm-name-input"
        />
        <button
          type="button"
          className={`ffm-share ${sharing ? "is-on" : ""}`}
          onClick={() => setSharing((s) => !s)}
          disabled={!name.trim()}
        >
          {sharing ? "✓ sharing" : "share my location"}
        </button>
      </div>

      {permError && <p className="ffm-error">⚠ {permError}</p>}

      <div className="ffm-map">
        <svg viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
          <rect width={W} height={H} fill="#0e1117" />
          {fixList.length === 0 ? (
            <text x={W / 2} y={H / 2} textAnchor="middle" fill="rgba(255,255,255,0.4)">
              no one is sharing yet
            </text>
          ) : (
            projected.map((p) => {
              const c = colorFor(p.peerId);
              const me = p.peerId === room.peerId;
              return (
                <g key={p.peerId}>
                  <circle cx={p.x} cy={p.y} r={me ? 8 : 6} fill={c} />
                  <text
                    x={p.x + 10}
                    y={p.y + 4}
                    fill="#e5e7eb"
                    fontSize="11"
                    fontWeight={me ? 700 : 400}
                  >
                    {p.fix.name}
                    {me ? " (you)" : ""}
                  </text>
                </g>
              );
            })
          )}
        </svg>
      </div>

      <section className="ffm-list">
        <h2 className="ffm-section-title">people</h2>
        {fixList.length === 0 ? (
          <p className="ffm-empty">no fixes yet</p>
        ) : (
          <ul>
            {fixList.map((f) => {
              const fresh = Date.now() - f.ts < 30_000;
              const distMe = myFix && f.peerId !== room.peerId ? haversine(myFix, f) : null;
              return (
                <li key={f.peerId} className={fresh ? "is-fresh" : "is-stale"}>
                  <span className="ffm-dot" style={{ background: colorFor(f.peerId) }} />
                  <span className="ffm-list-name">
                    {f.name}
                    {f.peerId === room.peerId ? " (you)" : ""}
                  </span>
                  <span className="ffm-list-meta">
                    ±{Math.round(f.accuracy)}m · {new Date(f.ts).toLocaleTimeString()}
                  </span>
                  {distMe !== null && (
                    <span className="ffm-dist">
                      {distMe < 1000
                        ? `${Math.round(distMe)} m`
                        : `${(distMe / 1000).toFixed(2)} km`}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
