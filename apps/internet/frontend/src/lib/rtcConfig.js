/**
 * rtcConfig.js — v2
 *
 * Builds the final RTCPeerConnection config for the Internet app at runtime,
 * merging the shared base STUN config from @letshare/core with an optional
 * TURN server read from VITE_TURN_* env vars.
 *
 * Why this lives in the Internet app and not in core:
 * TURN is specifically an Internet-mode concern — on a LAN, peers are
 * already on the same network segment and direct connection always
 * succeeds, so the LAN app never needs a TURN relay. Keeping this here
 * avoids LAN builds carrying unused TURN config.
 */
import { RTC_CONFIG as BASE_CONFIG } from '@letshare/core/lib/webrtc'

const turnUrl        = import.meta.env.VITE_TURN_URL
const turnUsername   = import.meta.env.VITE_TURN_USERNAME
const turnCredential  = import.meta.env.VITE_TURN_CREDENTIAL

export const RTC_CONFIG = turnUrl
  ? {
      ...BASE_CONFIG,
      iceServers: [
        ...BASE_CONFIG.iceServers,
        { urls: turnUrl, username: turnUsername, credential: turnCredential },
      ],
    }
  : BASE_CONFIG

if (!turnUrl && import.meta.env.PROD) {
  console.warn(
    '[LetsShare] No TURN server configured. Transfers between peers behind ' +
    'symmetric NATs or restrictive firewalls may fail to connect. ' +
    'Set VITE_TURN_URL/_USERNAME/_CREDENTIAL for production reliability.'
  )
}
